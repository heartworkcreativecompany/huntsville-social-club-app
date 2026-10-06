import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { appBaseUrl, getStripe } from '@/lib/stripe/config'
import {
  buildIdentityProfilePatch,
  mapStripeIdentityStatus,
  resolveUserIdFromIdentityMetadata,
  type IdentityVerificationStatus,
} from '@/lib/stripe/identity-status'
import {
  parseApprovalGates,
  parseVerificationState,
  verificationStateFromGates,
} from '@/lib/membership-systems'

export type { IdentityVerificationStatus, IdentityProfilePatch } from '@/lib/stripe/identity-status'
export {
  IDENTITY_FORBIDDEN_PROFILE_KEYS,
  IDENTITY_SAFE_PROFILE_KEYS,
  buildIdentityProfilePatch,
  gateStatusForIdentity,
  identityLastErrorMessage,
  mapStripeIdentityStatus,
  memberFacingIdentityRetryReason,
  resolveUserIdFromIdentityMetadata,
} from '@/lib/stripe/identity-status'

type Supabase = SupabaseClient<Database>

/**
 * Creates a Stripe Identity VerificationSession for member-facing
 * "Identity & location verification".
 * Requires:
 * 1) government ID document scan, and
 * 2) a matching selfie (require_matching_selfie).
 * Images stay in Stripe — we only persist session status metadata.
 * return_url is always `{appOrigin}/application/status?identity=return`.
 */
export async function createIdentityVerificationSession(input: {
  userId: string
  email?: string | null
}): Promise<{
  sessionId: string
  url: string
  status: IdentityVerificationStatus
}> {
  const stripe = getStripe()
  const returnUrl = `${appBaseUrl()}/application/status?identity=return`

  const session = await stripe.identity.verificationSessions.create({
    type: 'document',
    metadata: {
      user_id: input.userId,
    },
    options: {
      document: {
        // Document check + selfie that must match the ID photo.
        require_matching_selfie: true,
      },
    },
    return_url: returnUrl,
    ...(input.email
      ? {
          provided_details: {
            email: input.email,
          },
        }
      : {}),
  })

  if (!session.url) {
    throw new Error('Stripe Identity session did not return a verification URL.')
  }

  return {
    sessionId: session.id,
    url: session.url,
    status: mapStripeIdentityStatus(session.status),
  }
}

const IDENTITY_RECONCILE_STATUSES = new Set([
  'pending',
  'processing',
  'requires_input',
])

const IDENTITY_WRITE_ATTEMPTS = 3

const IDENTITY_PROFILE_SNAPSHOT_SELECT =
  'identity_verification_status, identity_verification_session_id, approval_gates, verification_state'

type IdentityProfileSnapshot = {
  identity_verification_status: string
  identity_verification_session_id: string | null
  approval_gates: unknown
  verification_state: unknown
}

type CasQuery = {
  eq(column: string, value: unknown): CasQuery
  is(column: string, value: null): CasQuery
  select(columns: string): Promise<{
    data: { id: string }[] | null
    error: { message: string } | null
  }>
}

export type IdentitySessionRegistration =
  | { ok: true }
  | { ok: false; reason: 'already_verified' | 'conflict' | 'not_found' }

function sameSessionId(left: string | null | undefined, right: string | null | undefined) {
  return (left ?? null) === (right ?? null)
}

function shouldSkipIdentityWrite(
  profile: IdentityProfileSnapshot,
  fresh: Stripe.Identity.VerificationSession
): boolean {
  const freshStatus = mapStripeIdentityStatus(fresh.status)
  if (profile.identity_verification_status === 'verified' && freshStatus !== 'verified') {
    return true
  }
  if (
    fresh.id !== profile.identity_verification_session_id &&
    freshStatus !== 'verified'
  ) {
    return true
  }
  return false
}

function expectColumn(
  query: CasQuery,
  column: string,
  value: unknown
): CasQuery {
  if (value == null) return query.is(column, null)
  return query.eq(column, value)
}

/**
 * Compare-and-swap on the snapshot that was read.
 * NULL session id, gates, and verification state use IS NULL.
 * Success requires a returned row, not merely an empty Supabase error.
 */
async function compareAndSwapIdentityProfile(
  supabase: Supabase,
  userId: string,
  expected: IdentityProfileSnapshot,
  patch: Database['public']['Tables']['profiles']['Update']
): Promise<boolean> {
  let query = supabase.from('profiles').update(patch) as unknown as CasQuery
  query = query.eq('id', userId)
  query = query.eq(
    'identity_verification_status',
    expected.identity_verification_status
  )
  query = expectColumn(
    query,
    'identity_verification_session_id',
    expected.identity_verification_session_id
  )
  query = expectColumn(query, 'approval_gates', expected.approval_gates)
  query = expectColumn(query, 'verification_state', expected.verification_state)

  const { data, error } = await query.select('id')
  if (error) throw new Error('Identity status update failed')
  return Array.isArray(data) && data.length > 0
}

async function loadIdentityProfileSnapshot(
  supabase: Supabase,
  userId: string
): Promise<IdentityProfileSnapshot | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(IDENTITY_PROFILE_SNAPSHOT_SELECT)
    .eq('id', userId)
    .maybeSingle()

  if (error) throw new Error('Identity status update failed')
  return data
}

/**
 * Apply a Stripe Identity VerificationSession to one applicant.
 * Re-reads the session from Stripe and commits with a compare-and-swap.
 * Does not set application_status to approved, change role, or grant paid access.
 */
export async function applyIdentityVerificationSession(
  supabase: Supabase,
  session: Stripe.Identity.VerificationSession,
  options?: { applicantId?: string }
): Promise<string | null> {
  const fresh = await getStripe().identity.verificationSessions.retrieve(
    session.id
  )
  const freshOwner = resolveUserIdFromIdentityMetadata(fresh.metadata)
  const eventOwner = resolveUserIdFromIdentityMetadata(session.metadata)

  let userId: string
  if (options?.applicantId) {
    if (!freshOwner || freshOwner !== options.applicantId) return null
    userId = options.applicantId
  } else {
    if (!eventOwner || !freshOwner || eventOwner !== freshOwner) return null
    userId = freshOwner
  }

  for (let attempt = 0; attempt < IDENTITY_WRITE_ATTEMPTS; attempt += 1) {
    const profile = await loadIdentityProfileSnapshot(supabase, userId)
    if (!profile) return null
    if (shouldSkipIdentityWrite(profile, fresh)) return userId

    const patch = buildIdentityProfilePatch({
      session: fresh,
      existingGates: profile.approval_gates,
      existingVerification: profile.verification_state,
    })
    const matched = await compareAndSwapIdentityProfile(
      supabase,
      userId,
      profile,
      patch
    )
    if (matched) return userId
  }

  throw new Error('Identity status update conflicted')
}

/**
 * Refresh one applicant from their stored Stripe Identity session.
 * No-ops unless status is pending, processing, or requires_input and a session id is stored.
 */
export async function reconcileIdentityVerification(
  userId: string,
  supabase: Supabase
): Promise<void> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('identity_verification_status, identity_verification_session_id')
    .eq('id', userId)
    .maybeSingle()

  const status = profile?.identity_verification_status
  const sessionId = profile?.identity_verification_session_id
  if (!status || !sessionId || !IDENTITY_RECONCILE_STATUSES.has(status)) {
    return
  }

  let fresh: Stripe.Identity.VerificationSession
  try {
    fresh = await getStripe().identity.verificationSessions.retrieve(sessionId)
  } catch {
    console.error('[identity] verification status refresh failed')
    return
  }

  if (resolveUserIdFromIdentityMetadata(fresh.metadata) !== userId) return

  try {
    await applyIdentityVerificationSession(supabase, fresh, { applicantId: userId })
  } catch {
    console.error('[identity] verification status refresh failed')
  }
}

export async function startMemberIdentityVerification(input: {
  supabase: Supabase
  userId: string
  email?: string | null
  applicationStatus: string | null
  identityStatus: string | null
  storedSessionId: string | null
}): Promise<
  | {
      ok: true
      sessionId: string
      url: string
      status: IdentityVerificationStatus
    }
  | { ok: false; error: string; httpStatus: number }
> {
  if (input.identityStatus === 'verified') {
    return {
      ok: false,
      error: 'Identity is already verified.',
      httpStatus: 400,
    }
  }

  if (input.storedSessionId) {
    let existing: Stripe.Identity.VerificationSession
    try {
      existing = await getStripe().identity.verificationSessions.retrieve(
        input.storedSessionId
      )
    } catch {
      console.error('[identity] verification status refresh failed')
      return {
        ok: false,
        error: 'Could not start identity verification. Please try again.',
        httpStatus: 500,
      }
    }

    if (resolveUserIdFromIdentityMetadata(existing.metadata) !== input.userId) {
      return {
        ok: false,
        error: 'Could not start identity verification. Please try again.',
        httpStatus: 409,
      }
    }

    if (mapStripeIdentityStatus(existing.status) === 'verified') {
      const applied = await applyIdentityVerificationSession(
        input.supabase,
        existing,
        { applicantId: input.userId }
      )
      if (applied !== input.userId) {
        return {
          ok: false,
          error: 'Could not start identity verification. Please try again.',
          httpStatus: 409,
        }
      }
      return {
        ok: false,
        error: 'Identity is already verified.',
        httpStatus: 400,
      }
    }
  }

  const applicationStatus = input.applicationStatus ?? 'draft'
  if (applicationStatus === 'draft' || applicationStatus === 'rejected') {
    return {
      ok: false,
      error:
        'Submit your membership application before starting identity verification.',
      httpStatus: 400,
    }
  }

  const session = await createIdentityVerificationSession({
    userId: input.userId,
    email: input.email,
  })
  const registration = await markIdentitySessionPending(
    input.supabase,
    input.userId,
    session.sessionId,
    input.storedSessionId
  )

  if (!registration.ok) {
    if (registration.reason === 'already_verified') {
      return {
        ok: false,
        error: 'Identity is already verified.',
        httpStatus: 400,
      }
    }
    return {
      ok: false,
      error: 'Could not start identity verification. Please try again.',
      httpStatus: 409,
    }
  }

  return {
    ok: true,
    sessionId: session.sessionId,
    url: session.url,
    status: session.status,
  }
}

export async function markIdentitySessionPending(
  supabase: Supabase,
  userId: string,
  sessionId: string,
  expectedSessionId: string | null
): Promise<IdentitySessionRegistration> {
  for (let attempt = 0; attempt < IDENTITY_WRITE_ATTEMPTS; attempt += 1) {
    const profile = await loadIdentityProfileSnapshot(supabase, userId)
    if (!profile) return { ok: false, reason: 'not_found' }
    if (profile.identity_verification_status === 'verified') {
      return { ok: false, reason: 'already_verified' }
    }
    if (!sameSessionId(profile.identity_verification_session_id, expectedSessionId)) {
      return { ok: false, reason: 'conflict' }
    }

    const gates = parseApprovalGates(profile.approval_gates)
    gates.identity_verified = 'pending_review'
    const verification_state = verificationStateFromGates(
      gates,
      parseVerificationState(profile.verification_state)
    )
    verification_state.id_verified = 'pending_review'

    const matched = await compareAndSwapIdentityProfile(supabase, userId, profile, {
      identity_verification_status: 'pending',
      identity_verification_session_id: sessionId,
      identity_verification_last_error: null,
      approval_gates: gates,
      verification_state,
      updated_at: new Date().toISOString(),
    })
    if (matched) return { ok: true }
  }

  return { ok: false, reason: 'conflict' }
}
