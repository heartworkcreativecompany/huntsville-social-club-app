import {
  PRODUCT_TIER_LABELS,
  type ProductTier,
} from '@/lib/membership-tier-config'

export const MEMBERSHIP_ACCESS_OVERRIDE_TIERS = [
  'inner_circle',
  'elite_circle',
] as const

export type MembershipAccessOverrideTier =
  (typeof MEMBERSHIP_ACCESS_OVERRIDE_TIERS)[number]

export type MembershipAccessOverride = {
  id: string
  userId: string
  tier: MembershipAccessOverrideTier
  startsAt: string
  expiresAt: string | null
  reason: string | null
  grantedBy: string
  revokedAt: string | null
  revokedBy: string | null
  createdAt: string
  updatedAt: string
}

/** Safe entitlement input — no reason, actors, or Stripe fields. */
export type SlimMembershipAccessOverride = {
  tier: MembershipAccessOverrideTier
  startsAt: string
  expiresAt: string | null
  revokedAt?: string | null
}

export const ADMIN_NOT_AUTHORIZED_ERROR =
  'Administrator access required.' as const

export function isMembershipAccessOverrideTier(
  value: string
): value is MembershipAccessOverrideTier {
  return (MEMBERSHIP_ACCESS_OVERRIDE_TIERS as readonly string[]).includes(value)
}

export function membershipAccessOverrideTierLabel(
  tier: MembershipAccessOverrideTier | ProductTier
): string {
  if (tier === 'inner_circle' || tier === 'elite_circle' || tier === 'member' || tier === 'connect') {
    return PRODUCT_TIER_LABELS[tier]
  }
  return tier
}

export function isActiveMembershipAccessOverride(
  override: SlimMembershipAccessOverride | MembershipAccessOverride | null | undefined,
  now: Date = new Date()
): override is SlimMembershipAccessOverride | MembershipAccessOverride {
  if (!override) return false
  if (override.revokedAt) return false
  const startsAt = Date.parse(override.startsAt)
  if (Number.isNaN(startsAt) || startsAt > now.getTime()) return false
  if (!override.expiresAt) return true
  const expiresAt = Date.parse(override.expiresAt)
  if (Number.isNaN(expiresAt)) return false
  return expiresAt > now.getTime()
}

export function grantMembershipAccessOverrideConfirmationCopy(
  tierLabel: string,
  memberName: string
): string {
  return `Grant complimentary ${tierLabel} access to ${memberName}? This does not change their Stripe subscription or billing.`
}

export function revokeMembershipAccessOverrideConfirmationCopy(
  tierLabel: string,
  memberName: string
): string {
  return `Revoke complimentary ${tierLabel} access from ${memberName}? Stripe subscription state is unchanged.`
}

export function membershipAccessOverrideAuditDetails(input: {
  tier: MembershipAccessOverrideTier
  startsAt?: string | null
  expiresAt?: string | null
  reason?: string | null
}): string {
  return JSON.stringify({
    tier: input.tier,
    starts_at: input.startsAt ?? null,
    expires_at: input.expiresAt ?? null,
    reason: input.reason?.trim() || null,
  })
}

export function denyNonAdminMembershipAccessOverride(
  isAdmin: boolean
): string | null {
  if (isAdmin) return null
  return ADMIN_NOT_AUTHORIZED_ERROR
}

export function sameOverridePayload(
  current: Pick<
    MembershipAccessOverride,
    'tier' | 'expiresAt' | 'reason'
  >,
  next: {
    tier: MembershipAccessOverrideTier
    expiresAt: string | null
    reason: string | null
  }
): boolean {
  return (
    current.tier === next.tier &&
    (current.expiresAt ?? null) === (next.expiresAt ?? null) &&
    (current.reason?.trim() || null) === (next.reason?.trim() || null)
  )
}

export function toSlimMembershipAccessOverride(
  override: MembershipAccessOverride | SlimMembershipAccessOverride | null
): SlimMembershipAccessOverride | null {
  if (!override) return null
  return {
    tier: override.tier,
    startsAt: override.startsAt,
    expiresAt: override.expiresAt,
    revokedAt: override.revokedAt ?? null,
  }
}
