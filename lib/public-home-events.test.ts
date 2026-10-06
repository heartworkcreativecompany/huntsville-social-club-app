import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PublicHomeExperiences } from '@/components/marketing/public-home-content'
import { formatEventScheduleInChicago } from '@/lib/event-time'
import { eventCoverImage } from '@/lib/event-images'
import {
  PUBLIC_EVENT_SELECT,
  publicEventPriceLabel,
  type PublicEvent,
} from '@/lib/load-public-events'
import {
  APPLY_FOR_FREE_MEMBERSHIP_CTA,
  IMPLIED_EXPERIENCES,
  IMPLIED_EXPERIENCES_HEADLINE,
  UPCOMING_EVENTS_HEADLINE,
  VIEW_ALL_EVENTS_HREF,
  VIEW_ALL_EVENTS_LABEL,
} from '@/lib/marketing-home-copy'

function event(overrides: Partial<PublicEvent> = {}): PublicEvent {
  return {
    id: 'event-1',
    title: 'Table Hop Game Night',
    description: 'Board games downtown.',
    location: 'Lipz Lounge',
    starts_at: '2026-10-15T23:00:00.000Z',
    ends_at: '2026-10-16T01:00:00.000Z',
    event_type: 'circle_social',
    fee_cents: 1500,
    attendance_max: 45,
    cover_image_url: 'https://images.example.com/game-night.jpg',
    ...overrides,
  }
}

function renderExperiences(events: PublicEvent[]) {
  return renderToStaticMarkup(
    createElement(PublicHomeExperiences, {
      events,
      signupHref: '/signup',
    })
  )
}

describe('homepage upcoming events', () => {
  it('renders up to three listed events with image, type, schedule, location, price, and link', () => {
    const listed = [
      event(),
      event({
        id: 'event-2',
        title: 'Morning coffee',
        event_type: 'standard_event',
        fee_cents: 0,
        location: 'Cafe',
        cover_image_url: null,
      }),
      event({
        id: 'event-3',
        title: 'Workshop',
        fee_cents: null,
        location: null,
        cover_image_url: '/brand/hsc-scene-workshop.jpg',
      }),
      event({ id: 'event-4', title: 'Fourth plan' }),
    ]
    const html = renderExperiences(listed)

    expect(html).toContain(UPCOMING_EVENTS_HEADLINE)
    expect(html).toContain('Members RSVP with their benefits')
    expect(html).not.toContain(IMPLIED_EXPERIENCES_HEADLINE)
    expect(html).not.toContain('Fourth plan')
    expect(html.match(/href="\/events\//g)?.length).toBe(3)

    expect(html).toContain('href="/events/event-1"')
    expect(html).toContain('Circle Social')
    expect(html).toContain('Table Hop Game Night')
    expect(html).toContain(
      formatEventScheduleInChicago(listed[0].starts_at, listed[0].ends_at)
    )
    expect(html).toContain('Lipz Lounge')
    expect(html).toContain(publicEventPriceLabel(1500) ?? '')
    expect(html).toContain('alt="Table Hop Game Night"')
    expect(html).toContain(eventCoverImage(listed[0].id, listed[0].cover_image_url))

    expect(html).toContain('href="/events/event-2"')
    expect(html).toContain('Standard Event')
    expect(html).toContain('Morning coffee')
    expect(html).toContain('Cafe')
    expect(html).not.toContain('>$0<')
    expect(html).toContain(encodeURIComponent(eventCoverImage('event-2', null)))

    expect(html).toContain('href="/events/event-3"')
    expect(html).toContain('Workshop')
    expect(html).toContain(encodeURIComponent('/brand/hsc-scene-workshop.jpg'))
    expect(html).toContain('lg:grid-cols-3')
  })

  it('keeps the static experience cards when nothing is listed', () => {
    const html = renderExperiences([])

    expect(html).toContain(IMPLIED_EXPERIENCES_HEADLINE)
    expect(html).toContain('guests can grab a spot at select events')
    expect(html).not.toContain('approved members')
    expect(html).not.toContain(UPCOMING_EVENTS_HEADLINE)
    for (const item of IMPLIED_EXPERIENCES) {
      expect(html).toContain(item.title)
      expect(html).toContain(item.description)
      expect(html).toContain(encodeURIComponent(item.imageSrc))
      expect(html).toContain(`alt="${item.imageAlt}"`)
    }
    expect(html).toContain('sm:grid-cols-2')
    expect(html).not.toContain('href="/events/event-1"')
  })

  it('links to the events page and keeps the membership application button', () => {
    for (const events of [[], [event()]]) {
      const html = renderExperiences(events)
      expect(html).toContain(`href="${VIEW_ALL_EVENTS_HREF}"`)
      expect(html).toContain(VIEW_ALL_EVENTS_LABEL)
      expect(html).toContain('href="/signup"')
      expect(html).toContain(APPLY_FOR_FREE_MEMBERSHIP_CTA)
      expect(html).not.toMatch(/—/)
    }
  })
})

describe('homepage public event loader', () => {
  const content = readFileSync(
    join(process.cwd(), 'components/marketing/public-home-content.tsx'),
    'utf8'
  )
  const loader = readFileSync(
    join(process.cwd(), 'lib/load-public-events.ts'),
    'utf8'
  )

  it('uses the cached anon loader and does not query another table', () => {
    expect(content).toContain('loadUpcomingPublicEvents')
    expect(content).not.toContain('createAnonymousClient')
    expect(content).not.toContain('.select(')
    expect(loader).toContain("from '@/lib/supabase/anonymous'")
    expect(loader).toContain('PUBLIC_EVENT_SELECT')
    expect(loader).toContain('revalidate: PUBLIC_EVENTS_REVALIDATE_SECONDS')
    expect(PUBLIC_EVENT_SELECT).toBe(
      'id, title, description, location, starts_at, ends_at, event_type, fee_cents, attendance_max, cover_image_url'
    )
    expect(content).not.toContain('event_attendees')
    expect(content).not.toContain('profiles')
  })
})
