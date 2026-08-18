import type Stripe from 'stripe'
import {
  parseApprovalGates,
  parseVerificationState,
  verificationStateFromGates,
  type ApprovalGates,
  type ReviewStatus,
  type VerificationState,
} from '@/lib/membership-systems'

export type IdentityVerificationStatus =
  | 'not_started'
  | 'pending'
  | 'processing'
  | 'verified'
  | 'requires_input'
  | 'canceled'

/** Fields we persist from Identity webhooks — never document/selfie payloads. */
export const IDENTITY_SAFE_PROFILE_KEYS = [
  'identity_verification_status',
  'identity_verification_session_id',
  'identity_verified_at',
  'identity_verification_last_error',
  'approval_gates',
  'verification_state',
  'updated_at',
] as const

/** Must never appear on Identity webhook profile updates. */
export const IDENTITY_FORBIDDEN_PROFILE_KEYS = [
  'application_status',
  'role',
  'verified_at',
  'membership_billing',
  'admin_review_notes',
] as const

export type IdentityProfilePatch = {
  identity_verification_status: IdentityVerificationStatus
  identity_verification_session_id: string
  identity_verified_at: string | null
  identity_verification_last_error: string | null
  approval_gates: ApprovalGates
  verification_state: VerificationState
  updated_at: string
}

/** Trusted Stripe metadata mapping only — never name/email/browser input. */
export function resolveUserIdFromIdentityMetadata(
  metadata: Stripe.Metadata | null | undefined
): string | null {
  const userId = metadata?.user_id
  return typeof userId === 'string' && userId.length > 0 ? userId : null
}

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

/**
 * Maps Stripe Identity status onto the identity_verified approval gate.
 * Verified ≠ membership approved — application_status stays unchanged.
 */
export function gateStatusForIdentity(
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

const MEMBER_FACING_RETRY_BY_CODE: Record<string, string> = {
  consent_declined:
    'Verification was not completed. You can try again when you are ready.',
  under_supported_age:
    'We could not complete verification with the information provided. Contact support if you need help.',
  country_not_supported:
    'That ID issuing country is not supported. Please try a different government ID.',
  document_expired:
    'That ID appears expired. Please try again with a valid government ID.',
  document_type_not_supported:
    'That ID type is not supported. Please try a different government ID.',
  document_unverified_other:
    'We could not verify that ID. Please try again with a clear photo of a valid government ID.',
  selfie_failure:
    'We could not match your selfie to your ID. Please try again in good lighting.',
  selfie_unverified_other:
    'We could not complete the selfie check. Please try again.',
}

/**
 * Member-safe retry guidance only — never persist Stripe reason text,
 * document values, or image references.
 */
export function memberFacingIdentityRetryReason(
  session: Stripe.Identity.VerificationSession
): string | null {
  const lastError = session.last_error
  if (!lastError) {
    return 'We need a bit more information to finish verification. Please try again.'
  }
  const code = lastError.code ? String(lastError.code) : null
  const message =
    (code && MEMBER_FACING_RETRY_BY_CODE[code]) ||
    'We need a bit more information to finish verification. Please try again.'
  return message.length > IDENTITY_ERROR_MAX_LENGTH
    ? `${message.slice(0, IDENTITY_ERROR_MAX_LENGTH - 1)}…`
    : message
}

/** @deprecated Prefer memberFacingIdentityRetryReason. */
export function identityLastErrorMessage(
  session: Stripe.Identity.VerificationSession
): string | null {
  return memberFacingIdentityRetryReason(session)
}

/**
 * Pure profile patch for Identity webhooks.
 * Updates verification state only — never membership approval, role, or paid access.
 */
export function buildIdentityProfilePatch(input: {
  session: Stripe.Identity.VerificationSession
  existingGates: unknown
  existingVerification: unknown
  verifiedAtIso?: string
}): IdentityProfilePatch {
  const status = mapStripeIdentityStatus(input.session.status)
  const now = input.verifiedAtIso ?? new Date().toISOString()
  const lastError =
    status === 'requires_input'
      ? memberFacingIdentityRetryReason(input.session)
      : null

  const gates = parseApprovalGates(input.existingGates)
  gates.identity_verified = gateStatusForIdentity(status)

  const verification_state = verificationStateFromGates(
    gates,
    parseVerificationState(input.existingVerification)
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

  const patch: IdentityProfilePatch = {
    identity_verification_status: status,
    identity_verification_session_id: input.session.id,
    identity_verified_at: status === 'verified' ? now : null,
    identity_verification_last_error: lastError,
    approval_gates: gates,
    verification_state,
    updated_at: now,
  }

  for (const key of IDENTITY_FORBIDDEN_PROFILE_KEYS) {
    if (key in patch) {
      throw new Error(`Identity patch must not include ${key}`)
    }
  }

  return patch
}
