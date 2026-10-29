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
  PENDING_CIRCLE_ENTITLEMENT_COPY,
  UNAVAILABLE_CIRCLE_ENTITLEMENT_COPY,
  UNMETERED_PREMIUM_EVENTS_COPY,
} from '@/lib/membership-pricing-copy'
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
  if (normalized.benefitFulfillment === 'pending') {
    return [PENDING_CIRCLE_ENTITLEMENT_COPY]
  }
  if (normalized.benefitFulfillment === 'unavailable') {
    return [UNAVAILABLE_CIRCLE_ENTITLEMENT_COPY]
  }
  if (!normalized.hasPaidMembership) {
    return [FREE_MEMBER_PREMIUM_CREDITS_COPY]
  }
  if (normalized.productTier === 'elite_circle') {
    return [
      normalized.creditsGranted == null
        ? UNMETERED_PREMIUM_EVENTS_COPY
        : elitePremiumRemainingHeadline(
            normalized.premiumCreditsRemaining,
            normalized.creditsGranted
          ),
      ...membershipPerkLinesFromSnapshot(normalized).slice(1),
    ]
  }
  if (normalized.productTier === 'inner_circle') {
    const lines = [
      normalized.creditsGranted == null
        ? UNMETERED_PREMIUM_EVENTS_COPY
        : innerIncludedSummary(
            normalized.premiumCreditsRemaining,
            normalized.creditsGranted
          ),
    ]
    if (normalized.circleSocialCreditsRemaining != null) {
      lines.push(
        normalized.circleSocialCreditsGranted === 0
          ? 'Circle Socials are paid per event on this membership.'
          : innerCircleSocialRemainingHeadline(
              normalized.circleSocialCreditsRemaining,
              normalized.circleSocialCreditsGranted ?? undefined
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
