import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { formatEventDateInChicago } from '@/lib/event-time'
import { formatFeeCents } from '@/lib/membership-tier-config'
import { createAnonymousClient } from '@/lib/supabase/anonymous'

/** Columns the anon role is allowed to read. Never select *. */
export const PUBLIC_EVENT_COLUMNS = [
  'id',
  'title',
  'description',
  'location',
  'starts_at',
  'ends_at',
  'event_type',
  'fee_cents',
  'attendance_max',
  'cover_image_url',
] as const

export const PUBLIC_EVENT_SELECT = PUBLIC_EVENT_COLUMNS.join(', ')

export const PUBLIC_EVENTS_REVALIDATE_SECONDS = 60

export type PublicEvent = {
  id: string
  title: string
  description: string | null
  location: string | null
  starts_at: string
  ends_at: string | null
  event_type: string | null
  fee_cents: number | null
  attendance_max: number | null
  cover_image_url: string | null
}

type PublicEventsReader = {
  from(table: 'events'): {
    select(columns: string): {
      order(
        column: 'starts_at',
        options: { ascending: boolean }
      ): PromiseLike<{
        data: PublicEvent[] | null
        error: { message: string } | null
      }>
      eq(
        column: 'id',
        value: string
      ): {
        maybeSingle(): PromiseLike<{
          data: PublicEvent | null
          error: { message: string } | null
        }>
      }
    }
  }
}

export function isUpcomingPublicEvent(
  event: Pick<PublicEvent, 'starts_at' | 'ends_at'>,
  now: Date
): boolean {
  const startsAt = new Date(event.starts_at).getTime()
  if (!Number.isNaN(startsAt) && startsAt >= now.getTime()) return true
  if (!event.ends_at) return false
  const endsAt = new Date(event.ends_at).getTime()
  return !Number.isNaN(endsAt) && endsAt >= now.getTime()
}

export function selectUpcomingPublicEvents(
  events: PublicEvent[],
  now = new Date()
): PublicEvent[] {
  return events
    .filter((event) => isUpcomingPublicEvent(event, now))
    .sort(
      (left, right) =>
        new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime()
    )
}

export function publicEventScheduleLabel(
  event: Pick<PublicEvent, 'starts_at' | 'ends_at'>
): string {
  const start = formatEventDateInChicago(event.starts_at)
  if (!event.ends_at) return start
  const end = formatEventDateInChicago(event.ends_at)
  if (!end || end === start) return start
  return `${start} to ${end}`
}

export function publicEventPriceLabel(
  feeCents: number | null | undefined
): string | null {
  if (feeCents == null || feeCents <= 0) return null
  return `$${formatFeeCents(feeCents)}`
}

export async function readUpcomingPublicEvents(
  client: PublicEventsReader,
  now = new Date()
): Promise<{ events: PublicEvent[]; error: string | null }> {
  const { data, error } = await client
    .from('events')
    .select(PUBLIC_EVENT_SELECT)
    .order('starts_at', { ascending: true })

  if (error) {
    return { events: [], error: error.message }
  }

  return {
    events: selectUpcomingPublicEvents(data ?? [], now),
    error: null,
  }
}

export async function readPublicEvent(
  client: PublicEventsReader,
  id: string
): Promise<PublicEvent | null> {
  const eventId = id.trim()
  if (!eventId) return null

  const { data, error } = await client
    .from('events')
    .select(PUBLIC_EVENT_SELECT)
    .eq('id', eventId)
    .maybeSingle()

  if (error || !data) return null
  return data
}

function anonymousReader(): PublicEventsReader {
  return createAnonymousClient() as unknown as PublicEventsReader
}

const readCachedUpcomingPublicEvents = unstable_cache(
  async () => readUpcomingPublicEvents(anonymousReader()),
  ['public-events-upcoming'],
  { revalidate: PUBLIC_EVENTS_REVALIDATE_SECONDS }
)

const readCachedPublicEvent = unstable_cache(
  async (id: string) => readPublicEvent(anonymousReader(), id),
  ['public-event'],
  { revalidate: PUBLIC_EVENTS_REVALIDATE_SECONDS }
)

export const loadUpcomingPublicEvents = cache(async () => {
  try {
    return await readCachedUpcomingPublicEvents()
  } catch {
    return { events: [], error: 'Public events are not configured.' }
  }
})

export const loadPublicEvent = cache(async (id: string) => {
  try {
    return await readCachedPublicEvent(id)
  } catch {
    return null
  }
})
