import type { Metadata } from 'next'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import EventDescription from '@/components/events/event-description'
import EventTypeBadge from '@/components/events/event-type-badge'
import PublicEventTickets from '@/components/marketing/public-event-tickets'
import PublicMarketingFrame, {
  memberEventRsvpHref,
} from '@/components/marketing/public-marketing-frame'
import {
  eventCoverImage,
  isRemoteEventCoverImage,
} from '@/lib/event-images'
import { eventDescriptionExcerpt } from '@/lib/event-description'
import { formatEventScheduleInChicago } from '@/lib/event-time'
import { loadEventTakenSeatCount } from '@/lib/event-seat-count'
import { loadPublicGuestListingFields } from '@/lib/load-public-guest-listing'
import {
  loadPublicEvent,
  publicEventPriceLabel,
} from '@/lib/load-public-events'
import {
  guestCheckoutReturnMessage,
  guestRsvpNeedsSeatCount,
  guestRsvpOffer,
} from '@/lib/public-guest-rsvp'

export const revalidate = 60

type PageProps = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ guest_checkout?: string | string[] }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const event = await loadPublicEvent(id)
  if (!event) {
    return {
      title: 'Event not found | Huntsville Social Club',
      description: 'This event is not on the public calendar.',
    }
  }

  const excerpt = eventDescriptionExcerpt(event.description)
  return {
    title: `${event.title} | Huntsville Social Club`,
    description:
      excerpt ||
      'A Huntsville Social Club gathering on the public calendar.',
  }
}

export default async function PublicEventDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params
  const query = await searchParams
  const event = await loadPublicEvent(id)
  if (!event) notFound()

  const now = new Date()
  const listing = await loadPublicGuestListingFields(event.id, now)
  const takenSeats =
    listing &&
    guestRsvpNeedsSeatCount({
      feeCents: event.fee_cents,
      startsAt: event.starts_at,
      generalRsvpOpen: listing.generalRsvpOpen,
      attendanceMax: event.attendance_max,
      now,
    })
      ? await loadEventTakenSeatCount(event.id)
      : null
  const guestOffer = listing
    ? guestRsvpOffer({
        feeCents: event.fee_cents,
        startsAt: event.starts_at,
        generalRsvpOpen: listing.generalRsvpOpen,
        attendanceMax: event.attendance_max,
        takenSeats,
        now,
      })
    : { kind: 'hidden' as const }
  const checkoutNotice = guestCheckoutReturnMessage(query.guest_checkout)

  const coverSrc = eventCoverImage(event.id, event.cover_image_url)
  const when = formatEventScheduleInChicago(event.starts_at, event.ends_at)
  const price = publicEventPriceLabel(event.fee_cents)

  return (
    <PublicMarketingFrame>
      <div className="mx-auto max-w-6xl px-5 pt-6 pb-16 sm:px-6 sm:pt-8 sm:pb-20 md:px-10">
        <div className="relative aspect-[21/9] w-full overflow-hidden rounded-xl bg-surface-elevated">
          <Image
            src={coverSrc}
            alt=""
            fill
            priority
            sizes="(max-width: 1152px) 100vw, 1152px"
            className="object-cover"
            unoptimized={isRemoteEventCoverImage(coverSrc)}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
          <div className="absolute right-0 bottom-0 left-0 p-6 sm:p-8">
            <EventTypeBadge eventType={event.event_type} />
            <h1 className="font-brand mt-3 text-3xl font-semibold text-white sm:text-4xl">
              {event.title}
            </h1>
            <p className="mt-2 text-sm text-white/80">
              {when}
              {event.location ? ` · ${event.location}` : ''}
            </p>
          </div>
        </div>

        <div className="mt-8 max-w-2xl">
          {checkoutNotice ? (
            <p
              className="mb-6 rounded-xl border border-white/10 bg-surface px-4 py-3 text-sm text-foreground"
              role="status"
            >
              {checkoutNotice}
            </p>
          ) : null}

          {price ? (
            <p className="mb-6 text-sm text-foreground">
              <span className="text-muted-foreground">Price </span>
              {price}
            </p>
          ) : null}

          <EventDescription text={event.description} />

          <PublicEventTickets
            eventId={event.id}
            memberHref={memberEventRsvpHref(event.id)}
            offer={guestOffer}
            rsvpQuestion={listing?.rsvpQuestion ?? null}
            rsvpQuestionRequired={listing?.rsvpQuestionRequired ?? false}
          />
        </div>
      </div>
    </PublicMarketingFrame>
  )
}
