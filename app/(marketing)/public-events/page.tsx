import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import ApplyMembershipCta from '@/components/marketing/apply-membership-cta'
import PublicMarketingFrame, {
  publicEventDetailHref,
  publicMarketingSignupHref,
} from '@/components/marketing/public-marketing-frame'
import EventTypeBadge from '@/components/events/event-type-badge'
import {
  eventCoverImage,
  isRemoteEventCoverImage,
} from '@/lib/event-images'
import { formatEventScheduleInChicago } from '@/lib/event-time'
import { loadUpcomingPublicEvents } from '@/lib/load-public-events'
import { PUBLIC_EVENTS_PAGE_INTRO } from '@/lib/marketing-home-copy'

export const revalidate = 60

export const metadata: Metadata = {
  title: 'Events | Huntsville Social Club',
  description:
    'See upcoming Huntsville Social Club gatherings. No account is required to view the calendar.',
}

export default async function PublicEventsPage() {
  const result = await loadUpcomingPublicEvents()
  const signupHref = publicMarketingSignupHref()

  return (
    <PublicMarketingFrame>
      <div className="mx-auto max-w-6xl px-5 pt-6 pb-16 sm:px-6 sm:pt-10 sm:pb-20 md:px-10">
        <p className="hero-eyebrow">
          <span className="hero-eyebrow-line" aria-hidden />
          Huntsville, Alabama
        </p>
        <h1 className="font-brand mt-5 max-w-3xl text-3xl font-semibold sm:text-4xl">
          Upcoming events
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          {PUBLIC_EVENTS_PAGE_INTRO}
        </p>

        <div className="mt-10">
          {result.error ? (
            <p className="text-sm text-muted-foreground">
              The calendar is unavailable right now. Please try again shortly.
            </p>
          ) : result.events.length === 0 ? (
            <div className="max-w-xl rounded-xl border border-white/10 bg-surface px-6 py-10">
              <h2 className="font-brand text-2xl font-semibold">
                No upcoming events
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                New gatherings will show up here when the club lists them. You
                can apply for membership in the meantime.
              </p>
              <div className="mt-6">
                <ApplyMembershipCta href={signupHref} />
              </div>
            </div>
          ) : (
            <ul className="grid gap-6 sm:grid-cols-2">
              {result.events.map((event) => {
                const coverSrc = eventCoverImage(event.id, event.cover_image_url)
                const when = formatEventScheduleInChicago(
                  event.starts_at,
                  event.ends_at
                )
                return (
                  <li key={event.id}>
                    <Link
                      href={publicEventDetailHref(event.id)}
                      className="group relative block min-h-[18rem] overflow-hidden rounded-xl border border-border no-underline"
                    >
                      <Image
                        src={coverSrc}
                        alt=""
                        fill
                        sizes="(max-width: 640px) 100vw, 50vw"
                        className="object-cover transition duration-500 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                        unoptimized={isRemoteEventCoverImage(coverSrc)}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/15" />
                      <div className="relative flex h-full min-h-[18rem] flex-col justify-end p-5">
                        <EventTypeBadge eventType={event.event_type} />
                        <h2 className="font-brand mt-3 text-xl font-semibold text-white">
                          {event.title}
                        </h2>
                        <p className="mt-2 text-sm leading-relaxed text-white/80">
                          {when}
                          {event.location ? ` · ${event.location}` : ''}
                        </p>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </PublicMarketingFrame>
  )
}
