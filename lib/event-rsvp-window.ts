import type { EventAccessType, ProductTier } from '@/lib/membership-tier-config'

export type EventRsvpWindowPhase =
  | 'before_priority'
  | 'elite_priority'
  | 'general'
  | 'open'

export type EventRsvpWindowInfo = {
  phase: EventRsvpWindowPhase
  /** Short label shown under Access, e.g. "Elite priority RSVP window". */
  label: string
  /** ISO timestamp when the current window ends (for countdown), if any. */
  countdownEndsAt: string | null
  /** Whether to show “Priority RSVP opens (Elite): …” (only before it opens). */
  showPriorityOpensLine: boolean
  /** Whether to show “General RSVP opens: …” (only while still upcoming). */
  showGeneralOpensLine: boolean
  priorityOpensAt: string | null
  generalOpensAt: string | null
}

function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
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

  if (!isPriorityEligibleEventType(input.eventType) || !generalAt) {
    return {
      phase: 'open',
      label: 'General RSVP window',
      countdownEndsAt: null,
      showPriorityOpensLine: false,
      showGeneralOpensLine: false,
      priorityOpensAt: input.priorityRsvpOpensAt ?? null,
      generalOpensAt: input.generalRsvpOpensAt ?? null,
    }
  }

  if (now >= generalAt) {
    return {
      phase: 'general',
      label: 'General RSVP window',
      countdownEndsAt: null,
      showPriorityOpensLine: false,
      showGeneralOpensLine: false,
      priorityOpensAt: input.priorityRsvpOpensAt ?? null,
      generalOpensAt: input.generalRsvpOpensAt ?? null,
    }
  }

  // Before general open — either waiting on priority, or Elite priority is live.
  if (priorityAt && now < priorityAt) {
    return {
      phase: 'before_priority',
      label: 'Priority RSVP window',
      countdownEndsAt: priorityAt.toISOString(),
      showPriorityOpensLine: true,
      showGeneralOpensLine: true,
      priorityOpensAt: input.priorityRsvpOpensAt ?? null,
      generalOpensAt: input.generalRsvpOpensAt ?? null,
    }
  }

  return {
    phase: 'elite_priority',
    label: 'Elite priority RSVP window',
    countdownEndsAt: generalAt.toISOString(),
    showPriorityOpensLine: false,
    showGeneralOpensLine: true,
    priorityOpensAt: input.priorityRsvpOpensAt ?? null,
    generalOpensAt: input.generalRsvpOpensAt ?? null,
  }
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

  if (input.window.phase === 'elite_priority' && tier === 'inner_circle') {
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

export function premiumCreditsSummary(input: {
  productTier: ProductTier
  premiumCreditsRemaining: number | null
  guestInvitesRemaining: number
  creditsGranted: number | null
}): string | null {
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

export function isElitePriorityWindowActive(
  window: EventRsvpWindowInfo
): boolean {
  return window.phase === 'elite_priority' && Boolean(window.countdownEndsAt)
}

/** Shared bubble surface styles for premium event layout. */
export const PREMIUM_BUBBLE_GOLD_CLASSNAME =
  'mb-6 rounded-2xl border-2 border-accent bg-accent-soft/20 px-5 py-4'

export const PREMIUM_BUBBLE_GREY_CLASSNAME =
  'mb-6 rounded-2xl border border-border bg-surface-elevated/60 px-5 py-4'

/**
 * Layout order for premium event bubbles.
 * Priority is included only while Elite priority is active.
 */
export function premiumEventBubbleOrder(input: {
  window: EventRsvpWindowInfo
  showMembershipPerks: boolean
}): Array<'priority' | 'rsvp' | 'perks'> {
  const order: Array<'priority' | 'rsvp' | 'perks'> = []
  if (isElitePriorityWindowActive(input.window)) {
    order.push('priority')
  }
  order.push('rsvp')
  if (input.showMembershipPerks) {
    order.push('perks')
  }
  return order
}
