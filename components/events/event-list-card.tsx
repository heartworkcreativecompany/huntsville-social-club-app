import Link from 'next/link'
import Card from '@/components/ui/card'
import EventMetaBadges from '@/components/events/event-meta-badges'
import EventTypeBadge from '@/components/events/event-type-badge'
import { formatEventDate, buttonPrimaryClassName } from '@/lib/event-labels'
import {
  eventCardAccessHint,
  isEventPast,
  memberGoingLabel,
} from '@/lib/event-display'
import type { EventRegistrationDecision } from '@/lib/membership-tier-config'
import EventRsvp from '@/app/(club)/events/event-rsvp'

type EventRow = {
  id: string
  title: string
  location: string | null
  starts_at: string
  description: string | null
  ends_at: string | null
  visibility: string
  status: string
  event_type?: string | null
}

type RsvpCounts = {
  going: number
  maybe: number
  not_going: number
}

/** Compact list card — aligned with member-facing event copy rules. */
export default function EventListCard({
  event,
  creatorLabel,
  counts,
  currentUserStatus,
  registrationPreview,
}: {
  event: EventRow
  creatorLabel: string
  counts: RsvpCounts
  currentUserStatus: string | null
  registrationPreview?: EventRegistrationDecision | null
}) {
  const isPast = isEventPast(event.starts_at, event.ends_at)
  const isCancelled = event.status === 'cancelled'
  const accessHint = eventCardAccessHint({
    registrationPreview: registrationPreview ?? null,
    currentUserStatus,
    isPast,
    isCancelled,
  })

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap gap-2">
            <EventTypeBadge eventType={event.event_type} />
            <EventMetaBadges
              isPast={isPast}
              isCancelled={isCancelled}
              currentUserStatus={currentUserStatus}
            />
          </div>
          <Link
            href={`/events/${event.id}`}
            className="text-display text-lg font-semibold underline decoration-border underline-offset-4 hover:decoration-accent"
          >
            {event.title}
          </Link>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatEventDate(event.starts_at)}
            {event.location ? ` · ${event.location}` : ''}
          </p>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="eyebrow">Host</dt>
          <dd className="mt-1 font-medium text-foreground">{creatorLabel}</dd>
        </div>
        <div>
          <dt className="eyebrow">Attendance</dt>
          <dd className="mt-1 font-medium text-foreground">
            {memberGoingLabel(counts.going)}
          </dd>
        </div>
      </dl>

      {accessHint ? (
        <p className="mt-3 text-sm font-medium text-accent">{accessHint}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3 border-t border-border pt-4">
        <Link href={`/events/${event.id}`} className={buttonPrimaryClassName}>
          View details
        </Link>
        {!isPast && !isCancelled ? (
          <EventRsvp
            eventId={event.id}
            eventStatus={event.status ?? 'published'}
            currentStatus={currentUserStatus}
            registrationPreview={registrationPreview}
            canRegisterGoing={registrationPreview?.allowed !== false}
          />
        ) : null}
      </div>
    </Card>
  )
}
