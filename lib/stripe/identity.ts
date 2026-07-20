import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { appBaseUrl, getStripe } from '@/lib/stripe/config'
import { resolveUserIdFromStripeMetadata } from '@/lib/stripe/sync-subscription'
import {
  parseApprovalGates,
  parseVerificationState,
  verificationStateFromGates,
  type ReviewStatus,
} from '@/lib/membership-systems'

export type IdentityVerificationStatus =
  | 'not_started'
  | 'pending'
  | 'processing'
  | 'verified'
  | 'requires_input'
  | 'canceled'

type Supabase = SupabaseClient<Database>

export function mapStripeIdentityStatus(
  status: Stripe.Identity.VerificationSession.Status
): IdentityVerificationStatus {
  switch (status) {
    case 'verified':
      return 'verified'
    case 'requires_input':
      return 'requires_input'
    case 'processing':
      return 'processing'
    case 'canceled':
      return 'canceled'
    default:
      return 'pending'
  }
}

function gateStatusForIdentity(
  status: IdentityVerificationStatus
): ReviewStatus {
  switch (status) {
    case 'verified':
      return 'approved'
    case 'requires_input':
      return 'needs_followup'
    case 'processing':
    case 'pending':
      return 'pending_review'
    case 'canceled':
    case 'not_started':
    default:
      return 'incomplete'
  }
}

const IDENTITY_ERROR_MAX_LENGTH = 280

/** Short code/reason only — never store verification reports or image payloads. */
export function identityLastErrorMessage(
  session: Stripe.Identity.VerificationSession
): string | null {
  const lastError = session.last_error
  if (!lastError) return null
  const code = lastError.code ? String(lastError.code) : null
  const reason = lastError.reason?.trim() || null
  const message = code && reason ? `${code}: ${reason}` : (reason ?? code)
  if (!message) return null
  return message.length > IDENTITY_ERROR_MAX_LENGTH
    ? `${message.slice(0, IDENTITY_ERROR_MAX_LENGTH - 1)}…`
    : message
}

/**
 * Creates a Stripe Identity VerificationSession that requires:
 * 1) government ID document scan, and
 * 2) a matching selfie (require_matching_selfie).
 * Images stay in Stripe — we only persist session status metadata.
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

export async function applyIdentityVerificationSession(
  supabase: Supabase,
  session: Stripe.Identity.VerificationSession
): Promise<string | null> {
  const userId = resolveUserIdFromStripeMetadata(session.metadata)
  if (!userId) return null

  const status = mapStripeIdentityStatus(session.status)
  const now = new Date().toISOString()
  const lastError =
    status === 'requires_input' ? identityLastErrorMessage(session) : null

  const { data: profile } = await supabase
    .from('profiles')
    .select('approval_gates, verification_state')
    .eq('id', userId)
    .maybeSingle()

  if (!profile) return null

  const gates = parseApprovalGates(profile.approval_gates)
  gates.identity_verified = gateStatusForIdentity(status)

  const verification_state = verificationStateFromGates(
    gates,
    parseVerificationState(profile.verification_state)
  )
  if (status === 'verified') {
    verification_state.id_verified = 'approved'
  } else if (status === 'requires_input') {
    verification_state.id_verified = 'needs_followup'
  } else if (status === 'processing' || status === 'pending') {
    verification_state.id_verified = 'pending_review'
  } else {
    verification_state.id_verified = 'incomplete'
  }

  await supabase
    .from('profiles')
    .update({
      identity_verification_status: status,
      identity_verification_session_id: session.id,
      identity_verified_at: status === 'verified' ? now : null,
      identity_verification_last_error: lastError,
      approval_gates: gates,
      verification_state,
      updated_at: now,
    })
    .eq('id', userId)

  return userId
}

export async function markIdentitySessionPending(
  supabase: Supabase,
  userId: string,
  sessionId: string
): Promise<void> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('approval_gates, verification_state')
    .eq('id', userId)
    .maybeSingle()

  if (!profile) return

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
