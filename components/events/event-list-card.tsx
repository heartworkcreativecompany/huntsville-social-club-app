import Link from 'next/link'
import Card from '@/components/ui/card'
import EventEligibilityBanner from '@/components/events/event-eligibility-banner'
import EventRsvpCounts from '@/components/events/event-rsvp-counts'
import EventStatusBadge from '@/components/events/event-status-badge'
import EventTierBadge from '@/components/events/event-tier-badge'
import { formatEventDate } from '@/lib/event-labels'
import { resolveEventEligibility } from '@/lib/event-eligibility'
import type { ApplicationStatus } from '@/lib/application'
import EventInlineEdit from '@/app/(club)/events/event-inline-edit'
import DeleteEventButton from '@/app/(club)/events/delete-event-button'
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
}

type RsvpCounts = {
  going: number
  maybe: number
  not_going: number
}

export default function EventListCard({
  event,
  creatorLabel,
  counts,
  currentUserStatus,
  userId,
  userRole,
  applicationStatus,
  canModerate,
}: {
  event: EventRow
  creatorLabel: string
  counts: RsvpCounts
  currentUserStatus: string | null
  userId: string
  userRole: string
  applicationStatus: ApplicationStatus
  canModerate: boolean
}) {
  const eligibility = resolveEventEligibility(
    { status: event.status, visibility: event.visibility },
    { applicationStatus, role: userRole }
  )

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap gap-2">
            <EventTierBadge tier={eligibility.tier} />
            <EventStatusBadge status={event.status} />
          </div>
          <Link
            href={`/events/${event.id}`}
            className="text-display text-lg font-semibold underline decoration-border underline-offset-4 hover:decoration-accent"
          >
            {event.title}
          </Link>
          <p className="mt-1 text-sm text-muted-foreground">
            Hosted by {creatorLabel}
          </p>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="eyebrow">When</dt>
          <dd className="mt-1 font-medium text-foreground">
            {formatEventDate(event.starts_at)}
          </dd>
        </div>
        {event.location ? (
          <div>
            <dt className="eyebrow">Location</dt>
            <dd className="mt-1 font-medium text-foreground">{event.location}</dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-4">
        <EventEligibilityBanner eligibility={eligibility} compact />
      </div>

      <div className="mt-4">
        <EventRsvpCounts counts={counts} />
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <p className="eyebrow mb-2">Your RSVP</p>
        <EventRsvp
          eventId={event.id}
          userId={userId}
          eventStatus={event.status ?? 'published'}
          currentStatus={currentUserStatus}
        />
      </div>

      {canModerate ? (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
          <EventInlineEdit
            eventId={event.id}
            initialTitle={event.title}
            initialLocation={event.location}
            initialStartsAt={event.starts_at}
            initialDescription={event.description}
            initialEndsAt={event.ends_at}
            initialVisibility={event.visibility}
            initialStatus={event.status ?? 'published'}
          />
          <DeleteEventButton eventId={event.id} />
        </div>
      ) : null}
    </Card>
  )
}
