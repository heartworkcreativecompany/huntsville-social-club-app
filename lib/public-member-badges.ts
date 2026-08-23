import {
  isActiveMembershipAccessOverride,
  type SlimMembershipAccessOverride,
} from '@/lib/membership-access-override'
import {
  membershipTierBadge,
  parseMembershipBilling,
  parsePremiumVerification,
  resolveMembershipTier,
  type DisplayBadge,
  type MembershipTierKey,
} from '@/lib/membership-systems'
import {
  SEEDED_RECOGNITION_BADGES,
  type PublicRecognitionBadge,
} from '@/lib/recognition-badges/catalog'

export type PublicPaidTier = 'inner_circle' | 'elite_circle'

export type PublicVisibleBadge = {
  key: string
  label: string
}

const RECOGNITION_ORDER = new Map<string, number>(
  SEEDED_RECOGNITION_BADGES.map((badge) => [badge.slug, badge.displayOrder])
)

function isStaffRole(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'host'
}

/**
 * Paid public tier only. Admin/Host keep existing public role-label behavior
 * (they are not shown as Elite Circle from entitlements).
 */
export function effectivePublicTier(input: {
  role?: string | null
  applicationStatus?: string | null
  billing?: unknown
  premium?: unknown
  accessOverride?: SlimMembershipAccessOverride | null
  now?: Date
}): PublicPaidTier | null {
  if (isStaffRole(input.role)) return null

  if (isActiveMembershipAccessOverride(input.accessOverride, input.now)) {
    return input.accessOverride.tier
  }

  const billing = parseMembershipBilling(input.billing)
  if (billing.tier === 'elite_circle' || billing.tier === 'premium_member') {
    return 'elite_circle'
  }
  if (billing.tier === 'inner_circle') {
    return 'inner_circle'
  }
  return null
}

export function resolvePublicMembershipTier(input: {
  role?: string | null
  applicationStatus?: string | null
  billing?: unknown
  premium?: unknown
  accessOverride?: SlimMembershipAccessOverride | null
  now?: Date
}): MembershipTierKey {
  const paid = effectivePublicTier(input)
  if (paid) return paid

  return resolveMembershipTier({
    application_status: input.applicationStatus,
    role: input.role,
    billing: parseMembershipBilling(input.billing),
    premium: parsePremiumVerification(input.premium),
  })
}

export function paidPublicTierFromMembershipTier(
  tier: MembershipTierKey | null | undefined
): PublicPaidTier | null {
  if (tier === 'elite_circle' || tier === 'premium_member') return 'elite_circle'
  if (tier === 'inner_circle') return 'inner_circle'
  return null
}

export function sortPublicRecognitionBadges(
  badges: PublicRecognitionBadge[] | null | undefined
): PublicRecognitionBadge[] {
  return [...(badges ?? [])].sort((a, b) => {
    const orderA = RECOGNITION_ORDER.get(a.slug) ?? Number.MAX_SAFE_INTEGER
    const orderB = RECOGNITION_ORDER.get(b.slug) ?? Number.MAX_SAFE_INTEGER
    if (orderA !== orderB) return orderA - orderB
    return a.publicLabel.localeCompare(b.publicLabel)
  })
}

export function publicStaffRoleLabel(
  role?: string | null
): 'Admin' | 'Host' | null {
  // Public cards/profiles do not currently show Admin/Host as a badge.
  void role
  return null
}

export function visiblePublicMemberBadges(input: {
  role?: string | null
  membership_tier: MembershipTierKey
  recognitionBadges?: PublicRecognitionBadge[] | null
}): DisplayBadge[] {
  const badges: DisplayBadge[] = []
  const staffLabel = publicStaffRoleLabel(input.role)
  if (staffLabel) {
    badges.push({
      key: staffLabel === 'Admin' ? 'admin' : 'host',
      label: staffLabel,
      variant: 'category',
    })
  }

  const paidTier = paidPublicTierFromMembershipTier(input.membership_tier)
  if (paidTier) {
    badges.push(membershipTierBadge(paidTier))
  }

  for (const badge of sortPublicRecognitionBadges(input.recognitionBadges)) {
    badges.push({
      key: badge.slug,
      label: badge.publicLabel,
      variant: 'premium_outline',
    })
  }

  if (badges.length === 0) {
    badges.push(membershipTierBadge('member'))
  }

  return badges
}

export function visiblePublicBadgeLabels(
  input: Parameters<typeof visiblePublicMemberBadges>[0]
): string[] {
  return visiblePublicMemberBadges(input).map((badge) => badge.label)
}

export function toPublicVisibleBadgeDto(
  badges: DisplayBadge[]
): PublicVisibleBadge[] {
  return badges.map((badge) => ({
    key: badge.key,
    label: badge.label,
  }))
}

export function publicMemberDisplayRevalidatePaths(memberId: string): string[] {
  return ['/members', `/members/${memberId}`, '/profile']
}
