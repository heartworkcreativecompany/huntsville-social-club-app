import Image from 'next/image'
import Link from 'next/link'
import Card from '@/components/ui/card'
import EventMetaBadges from '@/components/events/event-meta-badges'
import EventTypeBadge from '@/components/events/event-type-badge'
import { formatEventDate, buttonPrimaryClassName } from '@/lib/event-labels'
import { eventCoverImage } from '@/lib/event-images'
import {
  availabilityLabel,
  eventRsvpActionLabel,
  isEventPast,
  memberGoingLabel,
} from '@/lib/event-display'
import type { EventRegistrationDecision } from '@/lib/membership-tier-config'

type EventRow = {
  id: string
  title: string
  location: string | null
  starts_at: string
  description: string | null
  ends_at: string | null
  status: string
  event_type?: string | null
}

type RsvpCounts = {
  going: number
  maybe: number
  not_going: number
}

export default function EventRichCard({
  event,
  creatorLabel,
  counts,
  currentUserStatus,
  registrationPreview,
  capacity = null,
}: {
  event: EventRow
  creatorLabel: string
  counts: RsvpCounts
  currentUserStatus: string | null
  registrationPreview?: EventRegistrationDecision | null
  /** Optional capacity when schema supports it — omitted today. */
  capacity?: number | null
}) {
  const isPast = isEventPast(event.starts_at, event.ends_at)
  const isCancelled = event.status === 'cancelled'
  const spotsLabel = availabilityLabel(counts.going, capacity)
  const rsvpActionLabel = eventRsvpActionLabel({
    currentUserStatus,
    registrationPreview: registrationPreview ?? null,
    isPast,
    isCancelled,
  })

  return (
    <Card className="overflow-hidden p-0">
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-surface-elevated">
        <Image
          src={eventCoverImage(event.id)}
          alt=""
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
        <div className="absolute top-4 left-4 flex flex-wrap gap-2">
          <EventTypeBadge eventType={event.event_type} />
        </div>
        <div className="absolute right-0 bottom-0 left-0 p-5">
          <p className="text-xs tracking-wide text-white/75">
            {formatEventDate(event.starts_at)}
          </p>
          <h3 className="font-brand mt-1 text-2xl font-semibold text-white">
            {event.title}
          </h3>
        </div>
      </div>

      <div className="space-y-3 p-5 sm:p-6">
        <EventMetaBadges
          isPast={isPast}
          isCancelled={isCancelled}
          currentUserStatus={currentUserStatus}
          spotsLabel={spotsLabel}
        />

        {event.location ? (
          <p className="text-sm text-muted-foreground">{event.location}</p>
        ) : null}

        <p className="text-sm text-foreground">
          Hosted by <span className="font-medium text-accent">{creatorLabel}</span>
        </p>

        <p className="text-sm text-muted-foreground">
          {memberGoingLabel(counts.going)}
          {spotsLabel && spotsLabel !== 'Sold out' ? (
            <span> · {spotsLabel}</span>
          ) : null}
          {spotsLabel === 'Sold out' ? (
            <span className="text-danger"> · Sold out</span>
          ) : null}
        </p>

        {rsvpActionLabel ? (
          <p className="text-sm font-medium text-accent">{rsvpActionLabel}</p>
        ) : null}

        <div className="border-t border-border pt-4">
          <Link href={`/events/${event.id}`} className={buttonPrimaryClassName}>
            {isPast || isCancelled ? 'View event' : 'View details'}
          </Link>
        </div>
      </div>
    </Card>
  )
}
