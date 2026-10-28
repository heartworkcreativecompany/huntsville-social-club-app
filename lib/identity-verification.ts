import type { ApprovalGateKey } from '@/lib/membership-systems'

export const IN_PERSON_IDENTITY_METHOD = 'in_person' as const

export const IN_PERSON_IDENTITY_SOURCES = [
  'admin_action',
  'legacy_approval_gates.identity_verified',
] as const

export type InPersonIdentitySource = (typeof IN_PERSON_IDENTITY_SOURCES)[number]

export const LEGACY_IN_PERSON_IDENTITY_SOURCE =
  'legacy_approval_gates.identity_verified' as const

export const IDENTITY_GATE_UPDATE_REFUSAL =
  'Identity verification is not a membership-approval gate. Use Approve in-person identity verification.' as const

export type IdentityVerificationMethod = 'stripe' | 'in_person'

export type IdentityVerificationResolution = {
  verified: boolean
  methods: IdentityVerificationMethod[]
}

export type InPersonIdentityRecord = {
  status: 'verified' | 'revoked'
  revokedAt: string | null
}

/**
 * Accepted identity evidence for a future messaging and badge check.
 * Stripe success and an active in-person record are both sufficient.
 * Payment, role, founder status, complimentary access, and the legacy
 * approval gate are intentionally ignored.
 */
export function resolveIdentityVerification(input: {
  stripeStatus?: string | null
  inPerson?: InPersonIdentityRecord | null
  /** Ignored. Payment never verifies identity. */
  billingTier?: string | null
  /** Ignored. Complimentary access never verifies identity. */
  complimentary?: boolean
  /** Ignored. Role never verifies identity. */
  role?: string | null
  /** Ignored. A founder badge never verifies identity. */
  founder?: boolean
  /** Ignored. The legacy approval gate is not identity evidence. */
  approvalGateIdentity?: string | null
}): IdentityVerificationResolution {
  const methods: IdentityVerificationMethod[] = []
  if (input.stripeStatus === 'verified') methods.push('stripe')
  if (
    input.inPerson &&
    input.inPerson.status === 'verified' &&
    !input.inPerson.revokedAt
  ) {
    methods.push('in_person')
  }
  return { verified: methods.length > 0, methods }
}

export function refuseLegacyIdentityGateUpdate(
  gate: ApprovalGateKey
): string | null {
  if (gate !== 'identity_verified') return null
  return IDENTITY_GATE_UPDATE_REFUSAL
}

export type LegacyInPersonCandidate = {
  approvalGateIdentity: string | null | undefined
  stripeStatus: string | null | undefined
}

/** Explicit old identity-step approval that Stripe has not already recorded. */
export function isLegacyInPersonIdentityCandidate(
  candidate: LegacyInPersonCandidate
): boolean {
  return (
    candidate.approvalGateIdentity === 'approved' &&
    candidate.stripeStatus !== 'verified'
  )
}

export type LegacyInPersonInsert = {
  method: typeof IN_PERSON_IDENTITY_METHOD
  status: 'verified'
  source: typeof LEGACY_IN_PERSON_IDENTITY_SOURCE
  approved_by: null
  approved_at: null
  reconciled_at: string
  note: null
}

/**
 * Legacy recognition. Does not copy membership approval time or invent
 * the historical admin.
 */
export function legacyInPersonInsert(
  candidate: LegacyInPersonCandidate & { membershipApprovedAt?: string | null },
  reconciledAt: string
): LegacyInPersonInsert | null {
  if (!isLegacyInPersonIdentityCandidate(candidate)) return null
  return {
    method: IN_PERSON_IDENTITY_METHOD,
    status: 'verified',
    source: LEGACY_IN_PERSON_IDENTITY_SOURCE,
    approved_by: null,
    approved_at: null,
    reconciled_at: reconciledAt,
    note: null,
  }
}
