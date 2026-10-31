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

/** Lookup succeeded and produced a yes/no answer, or the lookup itself failed. */
export type AcceptedIdentityStatus = 'verified' | 'unverified' | 'unavailable'

export type InPersonIdentityLookup =
  | { ok: true; record: InPersonIdentityRecord | null }
  | { ok: false }

export const IDENTITY_REQUIRED_BEFORE_MESSAGING =
  'Verify your identity before sending messages.' as const

export const IDENTITY_LOOKUP_UNAVAILABLE_MESSAGE =
  'Identity verification could not be confirmed. Try again before sending.' as const

export const IDENTITY_MUTUAL_MESSAGE =
  'Messaging is available when both members have verified identity.' as const

export type InPersonIdentityRecord = {
  status: 'verified' | 'revoked'
  revokedAt: string | null
}

/**
 * Accepted identity evidence.
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

/**
 * Absent in-person evidence is unverified. A failed lookup is unavailable
 * and must not be treated as a successful unverified result.
 * Stripe evidence is used only after the in-person lookup succeeds.
 */
export function acceptedIdentityStatus(input: {
  stripeStatus?: string | null
  inPersonLookup: InPersonIdentityLookup
  billingTier?: string | null
  complimentary?: boolean
  role?: string | null
  founder?: boolean
  approvalGateIdentity?: string | null
}): AcceptedIdentityStatus {
  if (!input.inPersonLookup.ok) return 'unavailable'
  const resolved = resolveIdentityVerification({
    stripeStatus: input.stripeStatus,
    inPerson: input.inPersonLookup.record,
    billingTier: input.billingTier,
    complimentary: input.complimentary,
    role: input.role,
    founder: input.founder,
    approvalGateIdentity: input.approvalGateIdentity,
  })
  return resolved.verified ? 'verified' : 'unverified'
}

export function classifyInPersonLookup(input: {
  error: { message?: string } | null
  record: InPersonIdentityRecord | null
}): InPersonIdentityLookup {
  if (input.error) return { ok: false }
  return { ok: true, record: input.record }
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
