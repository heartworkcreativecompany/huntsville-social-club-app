import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import EventDescription from '@/components/events/event-description'
import EventTypeBadge from '@/components/events/event-type-badge'
import PublicMarketingFrame, {
  memberEventRsvpHref,
  publicMarketingSignupHref,
} from '@/components/marketing/public-marketing-frame'
import { marketingButtonSecondaryClassName } from '@/lib/event-labels'
import {
  eventCoverImage,
  isRemoteEventCoverImage,
} from '@/lib/event-images'
import { eventDescriptionExcerpt } from '@/lib/event-description'
import {
  loadPublicEvent,
  publicEventPriceLabel,
  publicEventScheduleLabel,
} from '@/lib/load-public-events'

export const revalidate = 60

type PageProps = {
  params: Promise<{ id: string }>
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

export default async function PublicEventDetailPage({ params }: PageProps) {
  const { id } = await params
  const event = await loadPublicEvent(id)
  if (!event) notFound()

  const coverSrc = eventCoverImage(event.id, event.cover_image_url)
  const when = publicEventScheduleLabel(event)
  const price = publicEventPriceLabel(event.fee_cents)
  const signupHref = publicMarketingSignupHref()

  return (
    <PublicMarketingFrame>
      <div className="mx-auto max-w-6xl px-5 pt-6 pb-16 sm:px-6 sm:pt-8 sm:pb-20 md:px-10">
        <Link
          href="/events"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          All events
        </Link>

        <div className="relative mt-6 aspect-[21/9] w-full overflow-hidden rounded-xl bg-surface-elevated">
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
          {price ? (
            <p className="mb-6 text-sm text-foreground">
              <span className="text-muted-foreground">Price </span>
              {price}
            </p>
          ) : null}

          <EventDescription text={event.description} />

          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
            <a
              href={memberEventRsvpHref(event.id)}
              className={marketingButtonSecondaryClassName}
            >
              Members: sign in to RSVP
            </a>
            <Link
              href={signupHref}
              className="text-sm font-medium text-accent underline underline-offset-4"
            >
              Apply for membership
            </Link>
          </div>
        </div>
      </div>
    </PublicMarketingFrame>
  )
}
