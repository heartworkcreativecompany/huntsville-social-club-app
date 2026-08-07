import { useSyncExternalStore } from 'react'
import {
  applyRsvpPerksSnapshot,
  type MembershipPerksSnapshot,
} from '@/lib/event-rsvp-window'
import type { MemberEntitlements } from '@/lib/membership-entitlements'
import {
  elitePremiumRemainingHeadline,
  FREE_MEMBER_PREMIUM_CREDITS_COPY,
  innerIncludedSummary,
} from '@/lib/membership-pricing-copy'
import type { ProductTier } from '@/lib/membership-tier-config'
import {
  ELITE_CIRCLE_PREMIUM_CREDITS_PER_PERIOD,
  INNER_CIRCLE_PREMIUM_CREDITS_PER_PERIOD,
} from '@/lib/membership-tier-config'

type Listener = () => void

let currentSnapshot: MembershipPerksSnapshot | null = null
const listeners = new Set<Listener>()

function emit() {
  for (const listener of listeners) {
    listener()
  }
}

export function getMemberPerksSnapshot(): MembershipPerksSnapshot | null {
  return currentSnapshot
}

export function subscribeMemberPerks(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Test helper — clears module state between tests. */
export function resetMemberPerksStoreForTests() {
  currentSnapshot = null
  emit()
}

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
    guestInvitesRemaining: Math.max(0, snapshot.guestInvitesRemaining),
  }
}

export function membershipPerksSnapshotFromEntitlements(
  entitlements: Pick<
    MemberEntitlements,
    | 'productTier'
    | 'premiumCreditsRemaining'
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
    guestInvitesRemaining: entitlements.guestInvitesRemaining,
    periodStart: entitlements.activeCycle?.period_start ?? null,
    periodEnd: entitlements.activeCycle?.period_end ?? null,
  })
}

/**
 * Authoritative update after RSVP / guest-invite mutations.
 * Always applies the server snapshot (with no-credit-refund guard for paid).
 */
export function updateMemberPerksFromSnapshot(
  next: MembershipPerksSnapshot
): MembershipPerksSnapshot {
  const normalized = normalizeMemberPerksSnapshot(next)

  if (!normalized.hasPaidMembership) {
    currentSnapshot = normalized
    emit()
    return currentSnapshot
  }

  if (
    currentSnapshot?.hasPaidMembership &&
    normalized.premiumCreditsRemaining >
      currentSnapshot.premiumCreditsRemaining &&
    normalized.periodEnd === currentSnapshot.periodEnd
  ) {
    // Same billing period: never bump credits from a mutation result
    // that would look like a refund.
    currentSnapshot = {
      ...normalized,
      premiumCreditsRemaining: currentSnapshot.premiumCreditsRemaining,
    }
  } else {
    currentSnapshot = normalized
  }
  emit()
  return currentSnapshot
}

/**
 * Apply an RSVP action payload to the shared store.
 */
export function applyRsvpResultToMemberPerksStore(input: {
  usedCredit?: boolean
  perks?: MembershipPerksSnapshot | null
}): MembershipPerksSnapshot | null {
  if (!input.perks && !currentSnapshot) {
    return null
  }

  const previous =
    currentSnapshot ??
    (input.perks as MembershipPerksSnapshot)

  if (!previous.hasPaidMembership && !(input.perks?.hasPaidMembership)) {
    return updateMemberPerksFromSnapshot(freeMemberPerksSnapshot())
  }

  const next = applyRsvpPerksSnapshot({
    previous,
    usedCredit: input.usedCredit,
    perks: input.perks,
  })

  return updateMemberPerksFromSnapshot(next)
}

/**
 * Hydrate from server props (layout / page load).
 * Free members always replace the store with a zeroed snapshot (clears any
 * stale Elite/Inner credits from a prior session).
 * Paid members: never increase credits from a possibly-stale RSC payload.
 */
export function hydrateMemberPerksFromServer(
  server: MembershipPerksSnapshot
): MembershipPerksSnapshot {
  const normalized = normalizeMemberPerksSnapshot(server)

  if (!normalized.hasPaidMembership) {
    currentSnapshot = normalized
    emit()
    return currentSnapshot
  }

  if (!currentSnapshot || !currentSnapshot.hasPaidMembership) {
    currentSnapshot = normalized
    emit()
    return currentSnapshot
  }

  if (
    normalized.periodEnd &&
    currentSnapshot.periodEnd &&
    normalized.periodEnd !== currentSnapshot.periodEnd
  ) {
    currentSnapshot = normalized
    emit()
    return currentSnapshot
  }

  currentSnapshot = {
    ...normalized,
    premiumCreditsRemaining: Math.min(
      normalized.premiumCreditsRemaining,
      currentSnapshot.premiumCreditsRemaining
    ),
    guestInvitesRemaining: currentSnapshot.guestInvitesRemaining,
  }
  emit()
  return currentSnapshot
}

/** Dashboard / Members card copy for included premium credits. */
export function dashboardCreditsSummaryFromSnapshot(
  snapshot: MembershipPerksSnapshot
): string | null {
  const normalized = normalizeMemberPerksSnapshot(snapshot)
  if (!normalized.hasPaidMembership) {
    return FREE_MEMBER_PREMIUM_CREDITS_COPY
  }
  if (normalized.productTier === 'elite_circle') {
    return elitePremiumRemainingHeadline(
      normalized.premiumCreditsRemaining,
      normalized.creditsGranted ?? ELITE_CIRCLE_PREMIUM_CREDITS_PER_PERIOD
    )
  }
  if (normalized.productTier === 'inner_circle') {
    return innerIncludedSummary(normalized.premiumCreditsRemaining)
  }
  return FREE_MEMBER_PREMIUM_CREDITS_COPY
}

export function useMemberPerks(): MembershipPerksSnapshot | null {
  return useSyncExternalStore(
    subscribeMemberPerks,
    getMemberPerksSnapshot,
    () => null
  )
}

/**
 * Resolve live perks, falling back to a server-provided snapshot.
 * Never prefer a stale paid store over an explicit free fallback.
 */
export function useMemberPerksWithFallback(
  fallback: MembershipPerksSnapshot | null
): MembershipPerksSnapshot | null {
  const live = useMemberPerks()
  if (fallback && !fallback.hasPaidMembership) {
    return normalizeMemberPerksSnapshot(fallback)
  }
  if (live) {
    return normalizeMemberPerksSnapshot(live)
  }
  return fallback ? normalizeMemberPerksSnapshot(fallback) : null
}

export { FREE_MEMBER_PREMIUM_CREDITS_COPY }
