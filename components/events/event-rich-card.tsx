import Image from 'next/image'
import Link from 'next/link'
import Card from '@/components/ui/card'
import EventEligibilityBanner from '@/components/events/event-eligibility-banner'
import EventStatusBadge from '@/components/events/event-status-badge'
import EventTierBadge from '@/components/events/event-tier-badge'
import { formatEventDate, buttonPrimaryClassName } from '@/lib/event-labels'
import { eventCoverImage } from '@/lib/event-images'
import { resolveEventEligibility } from '@/lib/event-eligibility'
import type { ApplicationStatus } from '@/lib/application'
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

export default function EventRichCard({
  event,
  creatorLabel,
  counts,
  currentUserStatus,
  userId,
  userRole,
  applicationStatus,
}: {
  event: EventRow
  creatorLabel: string
  counts: RsvpCounts
  currentUserStatus: string | null
  userId: string
  userRole: string
  applicationStatus: ApplicationStatus
}) {
  const eligibility = resolveEventEligibility(
    { status: event.status, visibility: event.visibility },
    { applicationStatus, role: userRole }
  )
  const going = counts.going
  const description = event.description?.trim()

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
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="absolute top-4 left-4 flex flex-wrap gap-2">
          <EventTierBadge tier={eligibility.tier} />
          <EventStatusBadge status={event.status} />
        </div>
        <div className="absolute right-0 bottom-0 left-0 p-5">
          <p className="text-xs tracking-wide text-white/70 uppercase">
            {formatEventDate(event.starts_at)}
          </p>
          <h3 className="font-brand mt-1 text-2xl font-semibold text-white">
            {event.title}
          </h3>
        </div>
      </div>

      <div className="space-y-4 p-5 sm:p-6">
        {event.location ? (
          <p className="text-sm text-muted-foreground">
            <span className="text-accent">Venue ·</span> {event.location}
          </p>
        ) : null}

        {description ? (
          <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}

        <p className="text-sm text-foreground">
          <span className="font-medium text-accent">{going}</span>
          {going === 1 ? ' member going' : ' members going'}
          {counts.maybe > 0 ? (
            <span className="text-muted-foreground"> · {counts.maybe} maybe</span>
          ) : null}
          <span className="text-muted-foreground"> · Hosted by {creatorLabel}</span>
        </p>

        <EventEligibilityBanner eligibility={eligibility} compact />

        <div className="flex flex-wrap gap-3 border-t border-border pt-4">
          <Link href={`/events/${event.id}`} className={buttonPrimaryClassName}>
            View details
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow">RSVP</span>
            <EventRsvp
              eventId={event.id}
              userId={userId}
              eventStatus={event.status ?? 'published'}
              currentStatus={currentUserStatus}
            />
          </div>
        </div>
      </div>
    </Card>
  )
}
