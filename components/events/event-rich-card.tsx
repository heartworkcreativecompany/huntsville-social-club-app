import EventImageCard from '@/components/events/event-image-card'
import EventMetaBadges from '@/components/events/event-meta-badges'
import EventTypeBadge from '@/components/events/event-type-badge'
import { formatEventDate, buttonPrimaryClassName } from '@/lib/event-labels'
import {
  eventCoverImage,
  isRemoteEventCoverImage,
} from '@/lib/event-images'
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
  cover_image_url?: string | null
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
  /** Optional attendance max when set on the event. */
  capacity?: number | null
}) {
  const coverSrc = eventCoverImage(event.id, event.cover_image_url)
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
    <EventImageCard
      href={`/events/${event.id}`}
      imageSrc={coverSrc}
      imageSizes="(max-width: 1024px) 100vw, 50vw"
      unoptimized={isRemoteEventCoverImage(coverSrc)}
    >
      <EventTypeBadge eventType={event.event_type} />
      <h3 className="font-brand text-2xl font-semibold text-balance text-foreground">
        {event.title}
      </h3>
      <p className="text-sm text-muted-foreground">
        {formatEventDate(event.starts_at)}
      </p>
      {event.location ? (
        <p className="text-sm text-muted-foreground">{event.location}</p>
      ) : null}

      <EventMetaBadges
        isPast={isPast}
        isCancelled={isCancelled}
        currentUserStatus={currentUserStatus}
        spotsLabel={spotsLabel}
      />

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
        <span className={buttonPrimaryClassName}>
          {isPast || isCancelled ? 'View event' : 'View details'}
        </span>
      </div>
    </EventImageCard>
  )
}
