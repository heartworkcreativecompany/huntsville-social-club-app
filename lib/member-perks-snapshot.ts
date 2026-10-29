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
      snapshot.creditsGranted === undefined
        ? snapshot.productTier === 'elite_circle'
          ? ELITE_CIRCLE_PREMIUM_CREDITS_PER_PERIOD
          : INNER_CIRCLE_PREMIUM_CREDITS_PER_PERIOD
        : snapshot.creditsGranted,
    circleSocialCreditsRemaining: snapshot.circleSocialCreditsRemaining ?? null,
    circleSocialCreditsGranted: snapshot.circleSocialCreditsGranted ?? null,
    guestInvitesRemaining: Math.max(0, snapshot.guestInvitesRemaining),
    guestInvitesGranted: snapshot.guestInvitesGranted ?? null,
  }
}

export function membershipPerksSnapshotFromEntitlements(
  entitlements: Pick<
    MemberEntitlements,
    | 'productTier'
    | 'billingProductTier'
    | 'premiumCreditsRemaining'
    | 'circleSocialCreditsRemaining'
    | 'guestInvitesRemaining'
    | 'activeCycle'
    | 'subscriptionActive'
    | 'benefitFulfillment'
  >
): MembershipPerksSnapshot {
  const planTier = entitlements.billingProductTier
  if (!isPaidPerksTier(planTier)) {
    return freeMemberPerksSnapshot('member')
  }

  const grantedDefault =
    planTier === 'elite_circle'
      ? ELITE_CIRCLE_PREMIUM_CREDITS_PER_PERIOD
      : INNER_CIRCLE_PREMIUM_CREDITS_PER_PERIOD
  const unissued =
    entitlements.benefitFulfillment === 'pending' ||
    entitlements.benefitFulfillment === 'unavailable'

  return normalizeMemberPerksSnapshot({
    productTier: planTier,
    hasPaidMembership: true,
    benefitFulfillment: entitlements.benefitFulfillment,
    premiumCreditsRemaining: unissued
      ? 0
      : (entitlements.premiumCreditsRemaining ?? 0),
    creditsGranted: unissued
      ? 0
      : entitlements.activeCycle
        ? entitlements.activeCycle.credits_granted
        : grantedDefault,
    circleSocialCreditsRemaining: unissued
      ? 0
      : entitlements.circleSocialCreditsRemaining,
    circleSocialCreditsGranted: unissued
      ? 0
      : (entitlements.activeCycle?.circle_social_credits_granted ?? null),
    guestInvitesRemaining: unissued ? 0 : entitlements.guestInvitesRemaining,
    guestInvitesGranted: unissued
      ? 0
      : (entitlements.activeCycle?.guest_invites_granted ?? null),
    periodStart: entitlements.activeCycle?.period_start ?? null,
    periodEnd: entitlements.activeCycle?.period_end ?? null,
  })
}
