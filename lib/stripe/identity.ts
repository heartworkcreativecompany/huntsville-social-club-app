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

/**
 * Apply a Stripe Identity VerificationSession to the mapped applicant.
 * Does not set application_status to approved, change role, or grant paid access.
 */
export async function applyIdentityVerificationSession(
  supabase: Supabase,
  session: Stripe.Identity.VerificationSession
): Promise<string | null> {
  const userId = await resolveIdentityApplicantId(supabase, session)
  if (!userId) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('approval_gates, verification_state')
    .eq('id', userId)
    .maybeSingle()

  if (!profile) return null

  const patch = buildIdentityProfilePatch({
    session,
    existingGates: profile.approval_gates,
    existingVerification: profile.verification_state,
  })

  await supabase.from('profiles').update(patch).eq('id', userId)

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
