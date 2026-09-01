'use client'

import { useMemo, useState } from 'react'
import EmptyState from '@/components/ui/empty-state'
import EventRichCard from '@/components/events/event-rich-card'
import EventFilterTabs from '@/components/events/event-filter-tabs'
import {
  matchesEventFilter,
  type EventListFilter,
} from '@/lib/event-display'
import type { EventRegistrationDecision } from '@/lib/membership-tier-config'

export type EventBrowserItem = {
  id: string
  title: string
  location: string | null
  starts_at: string
  ends_at: string | null
  description: string | null
  status: string
  event_type: string | null
  attendance_max: number | null
  cover_image_url: string | null
  creatorLabel: string
  counts: { going: number; maybe: number; not_going: number }
  currentUserStatus: string | null
  registrationPreview: EventRegistrationDecision | null
}

const EMPTY_COPY: Record<
  EventListFilter,
  { title: string; description: string }
> = {
  upcoming: {
    title: 'No upcoming events',
    description: 'New mixers and socials will appear here as they are announced.',
  },
  circle_social: {
    title: 'No Circle Socials on the calendar',
    description:
      'Circle Socials: Inner Circle includes 2 credits per billing period. Elite Circle includes all Circle Socials.',
  },
  premium_event: {
    title: 'No premium events on the calendar',
    description:
      'Premium events use membership credits or an event fee. Check back soon.',
  },
  past: {
    title: 'No past events yet',
    description: 'Events you have attended will show up here over time.',
  },
  rsvpd: {
    title: "You haven't RSVP'd yet",
    description: 'Events you register for will appear in this list.',
  },
}

export default function EventsBrowser({ events }: { events: EventBrowserItem[] }) {
  const [filter, setFilter] = useState<EventListFilter>('upcoming')

  const counts = useMemo(() => {
    const result: Partial<Record<EventListFilter, number>> = {}
    for (const tab of [
      'upcoming',
      'circle_social',
      'premium_event',
      'past',
      'rsvpd',
    ] as EventListFilter[]) {
      result[tab] = events.filter((event) =>
        matchesEventFilter({
          filter: tab,
          startsAt: event.starts_at,
          endsAt: event.ends_at,
          status: event.status,
          eventType: event.event_type,
          userRsvpStatus: event.currentUserStatus,
        })
      ).length
    }
    return result
  }, [events])

  const filtered = useMemo(
    () =>
      events.filter((event) =>
        matchesEventFilter({
          filter,
          startsAt: event.starts_at,
          endsAt: event.ends_at,
          status: event.status,
          eventType: event.event_type,
          userRsvpStatus: event.currentUserStatus,
        })
      ),
    [events, filter]
  )

  const sorted = useMemo(() => {
    const list = [...filtered]
    if (filter === 'past') {
      return list.sort(
        (a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime()
      )
    }
    return list.sort(
      (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
    )
  }, [filtered, filter])

  const empty = EMPTY_COPY[filter]

  return (
    <div className="space-y-8">
      <EventFilterTabs active={filter} onChange={setFilter} counts={counts} />

      {sorted.length === 0 ? (
        <EmptyState title={empty.title} description={empty.description} />
      ) : (
        <ul className="grid gap-6 lg:grid-cols-2">
          {sorted.map((event) => (
            <li key={event.id}>
              <EventRichCard
                event={event}
                creatorLabel={event.creatorLabel}
                counts={event.counts}
                currentUserStatus={event.currentUserStatus}
                registrationPreview={event.registrationPreview}
                capacity={event.attendance_max}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
