import { useSyncExternalStore } from 'react'
import {
  applyRsvpPerksSnapshot,
  type MembershipPerksSnapshot,
} from '@/lib/event-rsvp-window'
import type { MemberEntitlements } from '@/lib/membership-entitlements'
import {
  elitePremiumRemainingHeadline,
  innerIncludedSummary,
  memberFreeSummary,
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

export function membershipPerksSnapshotFromEntitlements(
  entitlements: Pick<
    MemberEntitlements,
    | 'productTier'
    | 'premiumCreditsRemaining'
    | 'guestInvitesRemaining'
    | 'activeCycle'
  >
): MembershipPerksSnapshot {
  const grantedDefault =
    entitlements.productTier === 'elite_circle'
      ? ELITE_CIRCLE_PREMIUM_CREDITS_PER_PERIOD
      : entitlements.productTier === 'inner_circle'
        ? INNER_CIRCLE_PREMIUM_CREDITS_PER_PERIOD
        : null

  return {
    productTier: entitlements.productTier,
    premiumCreditsRemaining: entitlements.premiumCreditsRemaining ?? 0,
    creditsGranted: entitlements.activeCycle?.credits_granted ?? grantedDefault,
    guestInvitesRemaining: entitlements.guestInvitesRemaining,
    periodStart: entitlements.activeCycle?.period_start ?? null,
    periodEnd: entitlements.activeCycle?.period_end ?? null,
  }
}

/**
 * Authoritative update after RSVP / guest-invite mutations.
 * Always applies the server snapshot (with no-credit-refund guard).
 */
export function updateMemberPerksFromSnapshot(
  next: MembershipPerksSnapshot
): MembershipPerksSnapshot {
  if (
    currentSnapshot &&
    next.premiumCreditsRemaining > currentSnapshot.premiumCreditsRemaining &&
    next.periodEnd === currentSnapshot.periodEnd
  ) {
    // Same billing period: never bump credits from a mutation result
    // that would look like a refund.
    currentSnapshot = {
      ...next,
      premiumCreditsRemaining: currentSnapshot.premiumCreditsRemaining,
    }
  } else {
    currentSnapshot = next
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

  const next = applyRsvpPerksSnapshot({
    previous,
    usedCredit: input.usedCredit,
    perks: input.perks,
  })

  return updateMemberPerksFromSnapshot(next)
}

/**
 * Hydrate from server props (layout / page load).
 * Within the same billing period, never increase credits from a possibly-stale
 * RSC payload — mutations call updateMemberPerksFromSnapshot.
 * Guest invites are owned by mutation updates once the store is live (so a
 * stale refresh cannot undo a just-returned invite, or restore a just-used one).
 * A new periodEnd trusts the server fully (rollover).
 */
export function hydrateMemberPerksFromServer(
  server: MembershipPerksSnapshot
): MembershipPerksSnapshot {
  if (!currentSnapshot) {
    currentSnapshot = server
    emit()
    return currentSnapshot
  }

  if (
    server.periodEnd &&
    currentSnapshot.periodEnd &&
    server.periodEnd !== currentSnapshot.periodEnd
  ) {
    currentSnapshot = server
    emit()
    return currentSnapshot
  }

  currentSnapshot = {
    ...server,
    premiumCreditsRemaining: Math.min(
      server.premiumCreditsRemaining,
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
  if (snapshot.productTier === 'elite_circle') {
    return elitePremiumRemainingHeadline(
      snapshot.premiumCreditsRemaining,
      snapshot.creditsGranted ?? ELITE_CIRCLE_PREMIUM_CREDITS_PER_PERIOD
    )
  }
  if (snapshot.productTier === 'inner_circle') {
    return innerIncludedSummary(snapshot.premiumCreditsRemaining)
  }
  if (snapshot.productTier === 'member') {
    return memberFreeSummary()
  }
  return null
}

export function useMemberPerks(): MembershipPerksSnapshot | null {
  return useSyncExternalStore(
    subscribeMemberPerks,
    getMemberPerksSnapshot,
    () => null
  )
}

/** Resolve live perks, falling back to a server-provided snapshot. */
export function useMemberPerksWithFallback(
  fallback: MembershipPerksSnapshot | null
): MembershipPerksSnapshot | null {
  const live = useMemberPerks()
  return live ?? fallback
}

export function isPaidPerksTier(
  tier: ProductTier
): tier is 'inner_circle' | 'elite_circle' {
  return tier === 'inner_circle' || tier === 'elite_circle'
}
