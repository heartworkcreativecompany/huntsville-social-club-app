import Link from 'next/link'
import Card from '@/components/ui/card'
import EmptyState from '@/components/ui/empty-state'
import EventTypeBadge from '@/components/events/event-type-badge'
import { buttonSecondaryClassName, formatEventDate } from '@/lib/event-labels'
import type { UpcomingEventPreview } from '@/lib/load-upcoming-events'

export const DASHBOARD_EVENTS_EMPTY = {
  title: 'No upcoming events yet',
  description:
    'New experiences are on the way. Check back soon to see what is coming up.',
  ctaLabel: 'View events',
  href: '/events',
} as const

export default function UpcomingEventsPreview({
  events,
  error,
}: {
  events: UpcomingEventPreview[]
  error: string | null
}) {
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-display text-xl font-semibold">Upcoming events</h2>
        {events.length > 0 ? (
          <Link href={DASHBOARD_EVENTS_EMPTY.href} className={buttonSecondaryClassName}>
            {DASHBOARD_EVENTS_EMPTY.ctaLabel}
          </Link>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : events.length === 0 ? (
        <EmptyState
          title={DASHBOARD_EVENTS_EMPTY.title}
          description={DASHBOARD_EVENTS_EMPTY.description}
          action={
            <Link href={DASHBOARD_EVENTS_EMPTY.href} className={buttonSecondaryClassName}>
              {DASHBOARD_EVENTS_EMPTY.ctaLabel}
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-3">
          {events.map((event) => (
            <li key={event.id}>
              <Link href={`/events/${event.id}`} className="block no-underline">
                <Card
                  padding="sm"
                  className="transition hover:border-accent/25 hover:bg-surface-elevated/40"
                >
                  <div className="mb-2">
                    <EventTypeBadge eventType={event.event_type} />
                  </div>
                  <p className="text-display text-lg font-semibold">{event.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatEventDate(event.starts_at)}
                    {event.location ? ` · ${event.location}` : ''}
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
