import type { EventRegistrationDecision } from '@/lib/membership-tier-config'
import type { EventAccessType } from '@/lib/membership-tier-config'

export type EventListFilter =
  | 'upcoming'
  | 'circle_social'
  | 'premium_event'
  | 'past'
  | 'rsvpd'

export const EVENT_LIST_FILTERS: {
  id: EventListFilter
  label: string
}[] = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'circle_social', label: 'Circle Socials' },
  { id: 'premium_event', label: 'Premium' },
  { id: 'past', label: 'Past' },
  { id: 'rsvpd', label: "RSVP'd" },
]

export function eventTypeLabel(
  eventType: EventAccessType | string | null | undefined
): 'Standard Event' | 'Circle Social' | 'Premium Event' {
  if (eventType === 'circle_social') return 'Circle Social'
  if (eventType === 'premium_event') return 'Premium Event'
  return 'Standard Event'
}

export function isEventPast(
  startsAt: string,
  endsAt?: string | null
): boolean {
  const reference = endsAt ? new Date(endsAt) : new Date(startsAt)
  return reference.getTime() < Date.now()
}

export function isEventUpcoming(
  startsAt: string,
  status: string | null | undefined
): boolean {
  if (status === 'cancelled') return false
  return new Date(startsAt).getTime() >= Date.now()
}

export function memberGoingLabel(going: number): string {
  if (going === 0) return 'Be the first to RSVP'
  if (going === 1) return '1 member going'
  return `${going} members going`
}

/**
 * Spots-left messaging when capacity is tracked. Schema has no capacity column today —
 * pass null/undefined to omit spots-left copy and rely on going count only.
 */
export function availabilityLabel(
  going: number,
  capacity?: number | null
): string | null {
  if (capacity == null || capacity <= 0) return null

  const spotsLeft = Math.max(0, capacity - going)
  if (spotsLeft <= 0) return 'Sold out'
  if (spotsLeft <= 3) return `Only ${spotsLeft} spots left`
  return `${spotsLeft} spots left`
}

export function hasUserRsvp(status: string | null | undefined): boolean {
  return status === 'going' || status === 'maybe'
}

export function eventCardAccessHint(input: {
  registrationPreview: EventRegistrationDecision | null
  currentUserStatus: string | null
  isPast: boolean
  isCancelled: boolean
}): string | null {
  if (input.isPast || input.isCancelled) return null
  if (hasUserRsvp(input.currentUserStatus)) return null

  const preview = input.registrationPreview
  if (!preview) return null

  if (!preview.allowed) {
    if (preview.code === 'priority_window') {
      return 'Elite priority RSVP window'
    }
    return null
  }

  if (
    preview.uiState === 'elite_circle_social_included' ||
    preview.uiState === 'member_standard_free'
  ) {
    return preview.uiState === 'member_standard_free'
      ? 'Free for members'
      : 'Included with Elite Circle'
  }

  if (preview.uiState === 'inner_circle_social_included') {
    return 'Included with Inner Circle'
  }

  if (
    preview.method === 'credit' ||
    preview.uiState === 'inner_premium_credit_remaining' ||
    preview.uiState === 'elite_premium_credit_remaining'
  ) {
    return 'Use premium credit'
  }

  if (preview.method === 'paid_per_event') {
    return 'Pay in advance'
  }

  return null
}

export function eventRsvpActionLabel(input: {
  currentUserStatus: string | null
  registrationPreview: EventRegistrationDecision | null
  isPast: boolean
  isCancelled: boolean
}): string | null {
  if (input.isPast || input.isCancelled) return null

  if (input.currentUserStatus === 'going') {
    return "Already RSVP'd"
  }

  if (input.currentUserStatus === 'maybe') {
    return 'Maybe attending'
  }

  const preview = input.registrationPreview
  if (!preview) return null

  if (!preview.allowed) {
    if (preview.code === 'priority_window') {
      return 'Elite priority window'
    }
    return null
  }

  if (
    preview.uiState === 'inner_premium_credit_exhausted' ||
    preview.uiState === 'elite_premium_credit_exhausted'
  ) {
    return 'No remaining credits'
  }

  if (
    preview.uiState === 'inner_premium_credit_remaining' ||
    preview.uiState === 'elite_premium_credit_remaining'
  ) {
    return 'RSVP with credit'
  }

  if (
    preview.uiState === 'elite_circle_social_included' ||
    preview.uiState === 'inner_circle_social_included' ||
    preview.uiState === 'member_standard_free'
  ) {
    return 'Included with membership'
  }

  if (preview.method === 'paid_per_event') {
    return 'Pay in advance'
  }

  return null
}

export function matchesEventFilter(input: {
  filter: EventListFilter
  startsAt: string
  endsAt: string | null
  status: string | null
  eventType: string | null
  userRsvpStatus: string | null
}): boolean {
  const past = isEventPast(input.startsAt, input.endsAt)
  const upcoming = isEventUpcoming(input.startsAt, input.status)
  const isCircleSocial = input.eventType === 'circle_social'
  const rsvpd = hasUserRsvp(input.userRsvpStatus)

  switch (input.filter) {
    case 'upcoming':
      return upcoming
    case 'circle_social':
      return isCircleSocial && upcoming
    case 'premium_event':
      return input.eventType === 'premium_event' && upcoming
    case 'past':
      return past || input.status === 'cancelled'
    case 'rsvpd':
      return rsvpd
  }
}
