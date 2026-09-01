import { useSyncExternalStore } from 'react'
import {
  applyRsvpPerksSnapshot,
  membershipPerkLinesFromSnapshot,
  type MembershipPerksSnapshot,
} from '@/lib/event-rsvp-window'
import {
  elitePremiumRemainingHeadline,
  FREE_MEMBER_PREMIUM_CREDITS_COPY,
  innerCircleSocialRemainingHeadline,
  innerIncludedSummary,
} from '@/lib/membership-pricing-copy'
import {
  ELITE_CIRCLE_PREMIUM_CREDITS_PER_PERIOD,
} from '@/lib/membership-tier-config'
import {
  freeMemberPerksSnapshot,
  normalizeMemberPerksSnapshot,
} from '@/lib/member-perks-snapshot'

export {
  freeMemberPerksSnapshot,
  isPaidPerksTier,
  membershipPerksSnapshotFromEntitlements,
  normalizeMemberPerksSnapshot,
} from '@/lib/member-perks-snapshot'

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
      circleSocialCreditsRemaining:
        typeof normalized.circleSocialCreditsRemaining === 'number' &&
        typeof currentSnapshot.circleSocialCreditsRemaining === 'number'
          ? currentSnapshot.circleSocialCreditsRemaining
          : normalized.circleSocialCreditsRemaining,
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
  usedCircleSocialCredit?: boolean
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
    usedCircleSocialCredit: input.usedCircleSocialCredit,
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
    circleSocialCreditsRemaining: clampCircleSocialRemaining(
      currentSnapshot.circleSocialCreditsRemaining,
      normalized.circleSocialCreditsRemaining
    ),
    guestInvitesRemaining: currentSnapshot.guestInvitesRemaining,
  }
  emit()
  return currentSnapshot
}

function clampCircleSocialRemaining(
  previous: number | null | undefined,
  next: number | null | undefined
): number | null {
  if (typeof previous === 'number' && typeof next === 'number') {
    return Math.min(previous, next)
  }
  return next ?? null
}

/** Dashboard / Members card copy for included premium credits. */
export function dashboardCreditsSummaryFromSnapshot(
  snapshot: MembershipPerksSnapshot
): string | null {
  const lines = dashboardPerkLinesFromSnapshot(snapshot)
  return lines[0] ?? null
}

export function dashboardPerkLinesFromSnapshot(
  snapshot: MembershipPerksSnapshot
): string[] {
  const normalized = normalizeMemberPerksSnapshot(snapshot)
  if (!normalized.hasPaidMembership) {
    return [FREE_MEMBER_PREMIUM_CREDITS_COPY]
  }
  if (normalized.productTier === 'elite_circle') {
    return [
      elitePremiumRemainingHeadline(
        normalized.premiumCreditsRemaining,
        normalized.creditsGranted ?? ELITE_CIRCLE_PREMIUM_CREDITS_PER_PERIOD
      ),
      ...membershipPerkLinesFromSnapshot(normalized).slice(1),
    ]
  }
  if (normalized.productTier === 'inner_circle') {
    const lines = [innerIncludedSummary(normalized.premiumCreditsRemaining)]
    if (normalized.circleSocialCreditsRemaining != null) {
      lines.push(
        innerCircleSocialRemainingHeadline(
          normalized.circleSocialCreditsRemaining
        )
      )
    }
    return lines
  }
  return [FREE_MEMBER_PREMIUM_CREDITS_COPY]
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
