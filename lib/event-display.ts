import type { EventRegistrationDecision } from '@/lib/membership-tier-config'
import type { EventAccessType } from '@/lib/membership-tier-config'

export type EventListFilter = 'upcoming' | 'circle_social' | 'past' | 'rsvpd'

export const EVENT_LIST_FILTERS: {
  id: EventListFilter
  label: string
}[] = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'circle_social', label: 'Circle Socials' },
  { id: 'past', label: 'Past' },
  { id: 'rsvpd', label: "RSVP'd" },
]

export function eventTypeLabel(
  eventType: EventAccessType | string | null | undefined
): 'Standard Event' | 'Circle Social' {
  return eventType === 'circle_social' ? 'Circle Social' : 'Standard Event'
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
    if (preview.code === 'circle_social_blocked') {
      return 'Included with Inner Circle and Elite Circle'
    }
    return null
  }

  if (preview.uiState === 'elite_unlimited') {
    return preview.circleSocialIncluded
      ? 'Included with Elite Circle'
      : 'Included with Elite Circle'
  }

  if (preview.uiState === 'inner_circle_social_included') {
    return 'Included with Inner Circle'
  }

  if (preview.method === 'credit') {
    return 'Included with Inner Circle'
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
    case 'past':
      return past || input.status === 'cancelled'
    case 'rsvpd':
      return rsvpd
  }
}
