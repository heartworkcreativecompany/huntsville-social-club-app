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
 * Map VerificationSession → applicant id via trusted Stripe metadata, then
 * durable session_id on profiles. Never by name/email/browser input alone.
 */
export async function resolveIdentityApplicantId(
  supabase: Supabase,
  session: Stripe.Identity.VerificationSession
): Promise<string | null> {
  const fromMeta = resolveUserIdFromIdentityMetadata(session.metadata)
  if (fromMeta) return fromMeta

  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('identity_verification_session_id', session.id)
    .maybeSingle()

  return data?.id ?? null
}

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

/**
 * Apply a Stripe Identity VerificationSession to the mapped applicant.
 * Re-reads the session from Stripe and ignores stale or out-of-order events.
 * Does not set application_status to approved, change role, or grant paid access.
 */
export async function applyIdentityVerificationSession(
  supabase: Supabase,
  session: Stripe.Identity.VerificationSession
): Promise<string | null> {
  const userId = await resolveIdentityApplicantId(supabase, session)
  if (!userId) return null

  const fresh = await getStripe().identity.verificationSessions.retrieve(
    session.id
  )
  const freshStatus = mapStripeIdentityStatus(fresh.status)

  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'approval_gates, verification_state, identity_verification_status, identity_verification_session_id'
    )
    .eq('id', userId)
    .maybeSingle()

  if (!profile) return null

  const currentStatus = profile.identity_verification_status
  const currentSessionId = profile.identity_verification_session_id

  if (currentStatus === 'verified' && freshStatus !== 'verified') {
    return userId
  }

  if (session.id !== currentSessionId && freshStatus !== 'verified') {
    return userId
  }

  const patch = buildIdentityProfilePatch({
    session: fresh,
    existingGates: profile.approval_gates,
    existingVerification: profile.verification_state,
  })

  await supabase.from('profiles').update(patch).eq('id', userId)

  return userId
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

  try {
    const fresh = await getStripe().identity.verificationSessions.retrieve(
      sessionId
    )
    await applyIdentityVerificationSession(supabase, fresh)
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
    try {
      const existing = await getStripe().identity.verificationSessions.retrieve(
        input.storedSessionId
      )
      if (mapStripeIdentityStatus(existing.status) === 'verified') {
        await applyIdentityVerificationSession(input.supabase, existing)
        return {
          ok: false,
          error: 'Identity is already verified.',
          httpStatus: 400,
        }
      }
    } catch {
      console.error('[identity] verification status refresh failed')
      return {
        ok: false,
        error: 'Could not start identity verification. Please try again.',
        httpStatus: 500,
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
  await markIdentitySessionPending(input.supabase, input.userId, session.sessionId)

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
  sessionId: string
): Promise<void> {
  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'approval_gates, verification_state, identity_verification_status'
    )
    .eq('id', userId)
    .maybeSingle()

  if (!profile || profile.identity_verification_status === 'verified') return

  const gates = parseApprovalGates(profile.approval_gates)
  gates.identity_verified = 'pending_review'

  const verification_state = verificationStateFromGates(
    gates,
    parseVerificationState(profile.verification_state)
  )
  verification_state.id_verified = 'pending_review'

  await supabase
    .from('profiles')
    .update({
      identity_verification_status: 'pending',
      identity_verification_session_id: sessionId,
      identity_verification_last_error: null,
      approval_gates: gates,
      verification_state,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
}
