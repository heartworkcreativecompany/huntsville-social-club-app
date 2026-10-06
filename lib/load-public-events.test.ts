import { describe, expect, it } from 'vitest'
import {
  PUBLIC_EVENT_COLUMNS,
  PUBLIC_EVENT_SELECT,
  isUpcomingPublicEvent,
  publicEventPriceLabel,
  publicEventScheduleLabel,
  readPublicEvent,
  readUpcomingPublicEvents,
  selectUpcomingPublicEvents,
  type PublicEvent,
} from '@/lib/load-public-events'

const NOW = new Date('2026-10-05T18:00:00.000Z')

function event(overrides: Partial<PublicEvent> = {}): PublicEvent {
  return {
    id: 'event-1',
    title: 'Rooftop social',
    description: 'Bring a friend.',
    location: 'Downtown Huntsville',
    starts_at: '2026-10-06T22:00:00.000Z',
    ends_at: '2026-10-07T01:00:00.000Z',
    event_type: 'circle_social',
    fee_cents: 2500,
    attendance_max: 20,
    cover_image_url: 'https://example.com/cover.jpg',
    ...overrides,
  }
}

type QueryResult = {
  data: PublicEvent[] | PublicEvent | null
  error: { message: string } | null
}

function reader(handlers: {
  list?: QueryResult
  detail?: (id: string) => QueryResult
  tables?: string[]
  selects?: string[]
}) {
  return {
    from(table: 'events') {
      handlers.tables?.push(table)
      return {
        select(columns: string) {
          handlers.selects?.push(columns)
          return {
            order() {
              return Promise.resolve(
                handlers.list ?? { data: [], error: null }
              )
            },
            eq(_column: 'id', value: string) {
              return {
                maybeSingle() {
                  return Promise.resolve(
                    handlers.detail?.(value) ?? { data: null, error: null }
                  )
                },
              }
            },
          }
        },
      }
    },
  }
}

describe('public event column allowlist', () => {
  it('selects only the anonymous calendar columns by name', () => {
    expect(PUBLIC_EVENT_COLUMNS).toEqual([
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
    ])
    expect(PUBLIC_EVENT_SELECT).toBe(PUBLIC_EVENT_COLUMNS.join(', '))
    expect(PUBLIC_EVENT_SELECT).not.toContain('*')
  })
})

describe('selectUpcomingPublicEvents', () => {
  it('keeps events that have not started, soonest first', () => {
    const later = event({ id: 'later', starts_at: '2026-10-08T22:00:00.000Z' })
    const sooner = event({ id: 'sooner', starts_at: '2026-10-06T22:00:00.000Z' })
    expect(selectUpcomingPublicEvents([later, sooner], NOW).map((row) => row.id)).toEqual([
      'sooner',
      'later',
    ])
  })

  it('keeps an in-progress event whose end is still in the future', () => {
    const current = event({
      id: 'current',
      starts_at: '2026-10-05T16:00:00.000Z',
      ends_at: '2026-10-05T20:00:00.000Z',
    })
    expect(isUpcomingPublicEvent(current, NOW)).toBe(true)
    expect(selectUpcomingPublicEvents([current], NOW)).toEqual([current])
  })

  it('drops events that have already ended, including those with no end time', () => {
    const ended = event({
      id: 'ended',
      starts_at: '2026-10-04T16:00:00.000Z',
      ends_at: '2026-10-04T18:00:00.000Z',
    })
    const noEnd = event({
      id: 'no-end',
      starts_at: '2026-10-04T16:00:00.000Z',
      ends_at: null,
    })
    expect(selectUpcomingPublicEvents([ended, noEnd], NOW)).toEqual([])
  })
})

describe('readUpcomingPublicEvents', () => {
  it('reads events with the allowlisted select and returns upcoming rows only', async () => {
    const tables: string[] = []
    const selects: string[] = []
    const past = event({
      id: 'past',
      starts_at: '2026-10-01T16:00:00.000Z',
      ends_at: '2026-10-01T18:00:00.000Z',
    })
    const upcoming = event({ id: 'upcoming' })
    const result = await readUpcomingPublicEvents(
      reader({
        tables,
        selects,
        list: { data: [past, upcoming], error: null },
      }),
      NOW
    )

    expect(tables).toEqual(['events'])
    expect(selects).toEqual([PUBLIC_EVENT_SELECT])
    expect(result.error).toBeNull()
    expect(result.events.map((row) => row.id)).toEqual(['upcoming'])
  })

  it('returns no events when the query fails and does not invent rows', async () => {
    const result = await readUpcomingPublicEvents(
      reader({ list: { data: null, error: { message: 'db down' } } }),
      NOW
    )
    expect(result).toEqual({ events: [], error: 'db down' })
  })
})

describe('readPublicEvent', () => {
  it('returns the row when the anonymous read succeeds', async () => {
    const row = event()
    const found = await readPublicEvent(
      reader({
        detail: () => ({ data: row, error: null }),
      }),
      'event-1'
    )
    expect(found).toEqual(row)
  })

  it('returns null for a blank, missing, or failed read', async () => {
    const selects: string[] = []
    expect(
      await readPublicEvent(reader({ selects }), '   ')
    ).toBeNull()
    expect(selects).toEqual([])

    expect(
      await readPublicEvent(
        reader({ detail: () => ({ data: null, error: null }) }),
        'missing'
      )
    ).toBeNull()
    expect(
      await readPublicEvent(
        reader({ detail: () => ({ data: null, error: { message: 'hidden' } }) }),
        'hidden'
      )
    ).toBeNull()
  })
})

describe('public event display helpers', () => {
  it('formats Chicago schedule text and shows a price only when the fee is positive', () => {
    expect(
      publicEventScheduleLabel(
        event({
          starts_at: '2026-10-04T22:00:00.000Z',
          ends_at: null,
        })
      )
    ).toBe('Sun, Oct 4, 5:00 PM')
    expect(publicEventPriceLabel(2500)).toBe('$25')
    expect(publicEventPriceLabel(0)).toBeNull()
    expect(publicEventPriceLabel(null)).toBeNull()
  })
})
