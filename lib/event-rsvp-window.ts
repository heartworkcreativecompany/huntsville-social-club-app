import type { EventAccessType, ProductTier } from '@/lib/membership-tier-config'

export type EventRsvpWindowPhase =
  | 'before_priority'
  | 'elite_priority'
  | 'general'
  | 'open'

export type EventRsvpWindowInfo = {
  /** Same as phase — stable machine code for UI conditions (e.g. 'elite_priority'). */
  code: EventRsvpWindowPhase
  phase: EventRsvpWindowPhase
  /** Short label, e.g. "Elite priority RSVP window". */
  label: string
  /** ISO timestamp for the active countdown, if any. */
  countdownEndsAt: string | null
  /** Countdown label prefix: "Opens in" before priority, "Ends in" while Elite priority is live. */
  countdownLabel: 'Opens in' | 'Ends in' | null
  /** Whether to show “Priority RSVP opens (Elite): …” (only before it opens). */
  showPriorityOpensLine: boolean
  /** Whether to show “General RSVP opens: …” (only while still upcoming). */
  showGeneralOpensLine: boolean
  /**
   * True while Elite priority RSVP is live
   * (at/after priority open, before general open).
   */
  isElitePriorityActive: boolean
  /**
   * True for the Priority RSVP bubble: waiting on priority open, or Elite priority live.
   * Hidden once general RSVP is open (or windows are unset).
   */
  showPriorityBubble: boolean
  priorityOpensAt: string | null
  generalOpensAt: string | null
}

function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

function windowBase(input: {
  phase: EventRsvpWindowPhase
  label: string
  countdownEndsAt: string | null
  countdownLabel: EventRsvpWindowInfo['countdownLabel']
  showPriorityOpensLine: boolean
  showGeneralOpensLine: boolean
  priorityOpensAt: string | null
  generalOpensAt: string | null
}): EventRsvpWindowInfo {
  const isElitePriorityActive = input.phase === 'elite_priority'
  const showPriorityBubble =
    input.phase === 'elite_priority' || input.phase === 'before_priority'

  return {
    code: input.phase,
    phase: input.phase,
    label: input.label,
    countdownEndsAt: input.countdownEndsAt,
    countdownLabel: input.countdownLabel,
    showPriorityOpensLine: input.showPriorityOpensLine,
    showGeneralOpensLine: input.showGeneralOpensLine,
    isElitePriorityActive,
    showPriorityBubble,
    priorityOpensAt: input.priorityOpensAt,
    generalOpensAt: input.generalOpensAt,
  }
}

export function isPriorityEligibleEventType(
  eventType: EventAccessType | string | null | undefined
): boolean {
  return eventType === 'circle_social' || eventType === 'premium_event'
}

/**
 * Resolve the current RSVP window for Circle Social / Premium events.
 * Priority window is active when now is at/after priority open (or priority unset)
 * and before general open.
 */
export function resolveEventRsvpWindow(input: {
  eventType: EventAccessType | string | null | undefined
  priorityRsvpOpensAt?: string | null
  generalRsvpOpensAt?: string | null
  now?: Date
}): EventRsvpWindowInfo {
  const now = input.now ?? new Date()
  const priorityAt = parseDate(input.priorityRsvpOpensAt)
  const generalAt = parseDate(input.generalRsvpOpensAt)
  const priorityOpensAt = input.priorityRsvpOpensAt ?? null
  const generalOpensAt = input.generalRsvpOpensAt ?? null

  if (!isPriorityEligibleEventType(input.eventType) || !generalAt) {
    return windowBase({
      phase: 'open',
      label: 'General RSVP window',
      countdownEndsAt: null,
      countdownLabel: null,
      showPriorityOpensLine: false,
      showGeneralOpensLine: false,
      priorityOpensAt,
      generalOpensAt,
    })
  }

  if (now >= generalAt) {
    return windowBase({
      phase: 'general',
      label: 'General RSVP window',
      countdownEndsAt: null,
      countdownLabel: null,
      showPriorityOpensLine: false,
      showGeneralOpensLine: false,
      priorityOpensAt,
      generalOpensAt,
    })
  }

  // Before general open — either waiting on priority, or Elite priority is live.
  if (priorityAt && now < priorityAt) {
    return windowBase({
      phase: 'before_priority',
      label: 'Priority RSVP window',
      countdownEndsAt: priorityAt.toISOString(),
      countdownLabel: 'Opens in',
      showPriorityOpensLine: true,
      showGeneralOpensLine: true,
      priorityOpensAt,
      generalOpensAt,
    })
  }

  return windowBase({
    phase: 'elite_priority',
    label: 'Elite priority RSVP window',
    countdownEndsAt: generalAt.toISOString(),
    countdownLabel: 'Ends in',
    showPriorityOpensLine: false,
    showGeneralOpensLine: true,
    priorityOpensAt,
    generalOpensAt,
  })
}

export type EventAccessMembershipCta =
  | { kind: 'view_memberships'; label: string; href: string }
  | { kind: 'upgrade_elite_priority'; label: string; href: string }
  | null

/**
 * Membership CTAs for the Access block during RSVP windows.
 */
export function resolveEventAccessMembershipCta(input: {
  productTier: ProductTier | null | undefined
  window: EventRsvpWindowInfo
  eventType?: EventAccessType | string | null
}): EventAccessMembershipCta {
  const tier = input.productTier ?? 'member'
  const eventType = input.eventType

  if (
    eventType &&
    eventType !== 'circle_social' &&
    eventType !== 'premium_event'
  ) {
    return null
  }

  if (tier === 'member') {
    return {
      kind: 'view_memberships',
      label: 'View memberships',
      href: '/upgrade',
    }
  }

  if (input.window.code === 'elite_priority' && tier === 'inner_circle') {
    return {
      kind: 'upgrade_elite_priority',
      label: 'Upgrade to Elite for priority access',
      href: '/upgrade',
    }
  }

  return null
}

export function formatEventWindowTimestamp(
  iso: string | null | undefined
): string | null {
  const date = parseDate(iso)
  if (!date) return null
  return date.toLocaleString()
}

export function formatCountdownRemaining(
  endsAtIso: string,
  now: Date = new Date()
): string {
  const endsAt = parseDate(endsAtIso)
  if (!endsAt) return ''

  const ms = endsAt.getTime() - now.getTime()
  if (ms <= 0) return 'ending now'

  const totalSeconds = Math.floor(ms / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }
  return `${seconds}s`
}

export type MembershipPerksSnapshot = {
  productTier: ProductTier
  /** True only for Inner/Elite with an active paid entitlement period. */
  hasPaidMembership: boolean
  premiumCreditsRemaining: number
  creditsGranted: number | null
  guestInvitesRemaining: number
  /** Active entitlement cycle start (ISO), when known. */
  periodStart?: string | null
  /** Active entitlement cycle end (ISO), when known. */
  periodEnd?: string | null
}

export function premiumCreditsSummary(input: {
  productTier: ProductTier
  premiumCreditsRemaining: number | null
  guestInvitesRemaining: number
  creditsGranted: number | null
  hasPaidMembership?: boolean
}): string | null {
  const hasPaid =
    input.hasPaidMembership ??
    (input.productTier === 'inner_circle' || input.productTier === 'elite_circle')
  if (!hasPaid) return null

  const { productTier, premiumCreditsRemaining, guestInvitesRemaining } = input
  if (productTier !== 'inner_circle' && productTier !== 'elite_circle') {
    return null
  }

  const remaining = premiumCreditsRemaining ?? 0
  const granted =
    input.creditsGranted ??
    (productTier === 'elite_circle' ? 2 : 1)

  if (productTier === 'elite_circle') {
    return `You have ${remaining} of ${granted} premium credits and ${guestInvitesRemaining} guest invite(s) remaining this billing period.`
  }

  return `You have ${remaining} of ${granted} premium credit(s) remaining this billing period.`
}

export function membershipPerksSummaryFromSnapshot(
  snapshot: MembershipPerksSnapshot
): string | null {
  if (!snapshot.hasPaidMembership) return null
  return premiumCreditsSummary(snapshot)
}

/**
 * Apply RSVP action result to Membership Perks state.
 * Credits never increase on Not going (no refund). Prefer the server
 * snapshot when present; otherwise decrement only when a credit was used.
 *
 * If usedCredit is true but the snapshot did not decrease remaining credits
 * (stale read / failed persist), force a local decrement so UI cannot claim
 * a credit was used while still showing the prior remaining count.
 */
export function applyRsvpPerksSnapshot(input: {
  previous: MembershipPerksSnapshot
  usedCredit?: boolean
  perks?: MembershipPerksSnapshot | null
}): MembershipPerksSnapshot {
  let next: MembershipPerksSnapshot
  if (input.perks) {
    next = input.perks
  } else if (input.usedCredit) {
    next = {
      ...input.previous,
      hasPaidMembership: input.previous.hasPaidMembership,
      premiumCreditsRemaining: Math.max(
        0,
        input.previous.premiumCreditsRemaining - 1
      ),
    }
  } else {
    next = input.previous
  }

  if (
    input.usedCredit &&
    next.premiumCreditsRemaining >= input.previous.premiumCreditsRemaining
  ) {
    next = {
      ...next,
      hasPaidMembership: next.hasPaidMembership || input.previous.hasPaidMembership,
      premiumCreditsRemaining: Math.max(
        0,
        input.previous.premiumCreditsRemaining - 1
      ),
    }
  }

  // Hard rule: RSVP changes never refund credits in the UI either.
  if (next.premiumCreditsRemaining > input.previous.premiumCreditsRemaining) {
    next = {
      ...next,
      premiumCreditsRemaining: input.previous.premiumCreditsRemaining,
    }
  }

  return next
}

/** Elite priority RSVP is currently live (Going open for Elite only). */
export function isElitePriorityWindowActive(
  window: EventRsvpWindowInfo
): boolean {
  return window.code === 'elite_priority' && Boolean(window.countdownEndsAt)
}

/** Priority bubble for the pre-general window (waiting or live). */
export function shouldShowPriorityRsvpBubble(
  window: EventRsvpWindowInfo
): boolean {
  return window.showPriorityBubble
}

/** Shared bubble surface styles for premium event layout. */
export const PREMIUM_BUBBLE_GOLD_CLASSNAME =
  'mb-6 rounded-2xl border-2 border-accent bg-accent-soft/20 px-5 py-4'

export const PREMIUM_BUBBLE_GREY_CLASSNAME =
  'mb-6 rounded-2xl border border-border bg-surface-elevated/60 px-5 py-4'

/**
 * Layout order for premium event bubbles.
 * Priority is included while waiting on / during Elite priority (before general).
 */
export function premiumEventBubbleOrder(input: {
  window: EventRsvpWindowInfo
  showMembershipPerks: boolean
}): Array<'priority' | 'rsvp' | 'perks'> {
  const order: Array<'priority' | 'rsvp' | 'perks'> = []
  if (shouldShowPriorityRsvpBubble(input.window)) {
    order.push('priority')
  }
  order.push('rsvp')
  if (input.showMembershipPerks) {
    order.push('perks')
  }
  return order
}
