import { describe, expect, it } from 'vitest'
import {
  EVENT_TIME_DIAGNOSTIC_QUERY,
  diagnoseStoredEventTimes,
} from '@/lib/event-time-diagnostics'

describe('diagnoseStoredEventTimes', () => {
  it('is a read-only mapping of stored timestamps to Chicago display values', () => {
    expect(EVENT_TIME_DIAGNOSTIC_QUERY).toMatch(/SELECT id, title, starts_at, ends_at/i)
    expect(EVENT_TIME_DIAGNOSTIC_QUERY).not.toMatch(/\b(UPDATE|INSERT|DELETE)\b/i)

    const rows = diagnoseStoredEventTimes([
      {
        id: 'evt_1',
        title: 'Rooftop social',
        starts_at: '2026-10-04T22:00:00.000Z',
        ends_at: '2026-10-04T23:00:00.000Z',
      },
      {
        id: 'evt_2',
        title: 'Ambiguous stored noon UTC',
        starts_at: '2026-10-04T17:00:00.000Z',
        ends_at: null,
      },
    ])

    expect(rows[0]).toMatchObject({
      id: 'evt_1',
      title: 'Rooftop social',
      rawStartsAt: '2026-10-04T22:00:00.000Z',
      chicagoStartsAt: 'Sun, Oct 4, 5:00 PM',
      editorPrefillStart: '2026-10-04T17:00',
      displayPath: 'formatEventDateInChicago (America/Chicago)',
    })
    expect(rows[1].chicagoStartsAt).toBe('Sun, Oct 4, 12:00 PM')
    expect(rows[1].editorPrefillStart).toBe('2026-10-04T12:00')
  })
})
