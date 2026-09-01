import type { MembershipPerksSnapshot } from '@/lib/event-rsvp-window'
import type { MemberEntitlements } from '@/lib/membership-entitlements'
import type { ProductTier } from '@/lib/membership-tier-config'
import {
  ELITE_CIRCLE_PREMIUM_CREDITS_PER_PERIOD,
  INNER_CIRCLE_PREMIUM_CREDITS_PER_PERIOD,
} from '@/lib/membership-tier-config'

export function isPaidPerksTier(
  tier: ProductTier
): tier is 'inner_circle' | 'elite_circle' {
  return tier === 'inner_circle' || tier === 'elite_circle'
}

/** Explicit zeroed snapshot for free / cancelled / no-subscription members. */
export function freeMemberPerksSnapshot(
  _productTier: ProductTier = 'member'
): MembershipPerksSnapshot {
  return {
    productTier: 'member',
    hasPaidMembership: false,
    premiumCreditsRemaining: 0,
    creditsGranted: 0,
    circleSocialCreditsRemaining: null,
    circleSocialCreditsGranted: null,
    guestInvitesRemaining: 0,
    periodStart: null,
    periodEnd: null,
  }
}

/**
 * Normalize any snapshot: free members never carry paid credit defaults
 * (e.g. Elite's 2-credit fallback).
 */
export function normalizeMemberPerksSnapshot(
  snapshot: MembershipPerksSnapshot
): MembershipPerksSnapshot {
  const hasPaidMembership =
    snapshot.hasPaidMembership === true &&
    isPaidPerksTier(snapshot.productTier)

  if (!hasPaidMembership) {
    return freeMemberPerksSnapshot(
      snapshot.productTier === 'member' ? 'member' : 'member'
    )
  }

  return {
    ...snapshot,
    hasPaidMembership: true,
    premiumCreditsRemaining: Math.max(0, snapshot.premiumCreditsRemaining),
    creditsGranted:
      snapshot.creditsGranted ??
      (snapshot.productTier === 'elite_circle'
        ? ELITE_CIRCLE_PREMIUM_CREDITS_PER_PERIOD
        : INNER_CIRCLE_PREMIUM_CREDITS_PER_PERIOD),
    circleSocialCreditsRemaining:
      snapshot.productTier === 'inner_circle'
        ? snapshot.circleSocialCreditsRemaining ?? null
        : null,
    circleSocialCreditsGranted:
      snapshot.productTier === 'inner_circle'
        ? snapshot.circleSocialCreditsGranted ?? null
        : null,
    guestInvitesRemaining: Math.max(0, snapshot.guestInvitesRemaining),
  }
}

export function membershipPerksSnapshotFromEntitlements(
  entitlements: Pick<
    MemberEntitlements,
    | 'productTier'
    | 'premiumCreditsRemaining'
    | 'circleSocialCreditsRemaining'
    | 'guestInvitesRemaining'
    | 'activeCycle'
    | 'subscriptionActive'
  >
): MembershipPerksSnapshot {
  if (!isPaidPerksTier(entitlements.productTier)) {
    return freeMemberPerksSnapshot('member')
  }

  const grantedDefault =
    entitlements.productTier === 'elite_circle'
      ? ELITE_CIRCLE_PREMIUM_CREDITS_PER_PERIOD
      : INNER_CIRCLE_PREMIUM_CREDITS_PER_PERIOD

  return normalizeMemberPerksSnapshot({
    productTier: entitlements.productTier,
    hasPaidMembership: true,
    premiumCreditsRemaining: entitlements.premiumCreditsRemaining ?? 0,
    creditsGranted: entitlements.activeCycle?.credits_granted ?? grantedDefault,
    circleSocialCreditsRemaining: entitlements.circleSocialCreditsRemaining,
    circleSocialCreditsGranted:
      entitlements.activeCycle?.circle_social_credits_granted ?? null,
    guestInvitesRemaining: entitlements.guestInvitesRemaining,
    periodStart: entitlements.activeCycle?.period_start ?? null,
    periodEnd: entitlements.activeCycle?.period_end ?? null,
  })
}
