import { afterEach, describe, expect, it } from 'vitest'
import {
  EVENT_TIME_ZONE,
  chicagoDateAndTimeFromIso,
  chicagoWallTimeToUtcDate,
  formatEventDateInChicago,
  parseChicagoDatetimeLocalToIso,
  toChicagoDatetimeLocalValue,
} from '@/lib/event-time'

const ORIGINAL_TZ = process.env.TZ

afterEach(() => {
  if (ORIGINAL_TZ === undefined) {
    delete process.env.TZ
  } else {
    process.env.TZ = ORIGINAL_TZ
  }
})

describe('America/Chicago event time contract', () => {
  it('converts 5:00 PM CDT on 2026-10-04 to the correct UTC instant', () => {
    expect(parseChicagoDatetimeLocalToIso('2026-10-04T17:00')).toBe(
      '2026-10-04T22:00:00.000Z'
    )
    expect(parseChicagoDatetimeLocalToIso('2026-10-04T17:00:00')).toBe(
      '2026-10-04T22:00:00.000Z'
    )

    const prefill = chicagoDateAndTimeFromIso('2026-10-04T22:00:00.000Z')
    expect(prefill).toEqual({ date: '2026-10-04', time: '17:00' })
    expect(toChicagoDatetimeLocalValue('2026-10-04T22:00:00.000Z')).toBe(
      '2026-10-04T17:00'
    )
    expect(formatEventDateInChicago('2026-10-04T22:00:00.000Z')).toBe(
      'Sun, Oct 4, 5:00 PM'
    )
  })

  it('converts 5:00 PM CST in January using the standard-time offset', () => {
    expect(parseChicagoDatetimeLocalToIso('2026-01-15T17:00')).toBe(
      '2026-01-15T23:00:00.000Z'
    )
    expect(formatEventDateInChicago('2026-01-15T23:00:00.000Z')).toBe(
      'Thu, Jan 15, 5:00 PM'
    )
    expect(toChicagoDatetimeLocalValue('2026-01-15T23:00:00.000Z')).toBe(
      '2026-01-15T17:00'
    )
  })

  it('selects the post-spring-forward CDT offset automatically', () => {
    expect(parseChicagoDatetimeLocalToIso('2026-03-08T01:00')).toBe(
      '2026-03-08T07:00:00.000Z'
    )
    expect(parseChicagoDatetimeLocalToIso('2026-03-08T03:00')).toBe(
      '2026-03-08T08:00:00.000Z'
    )
    expect(formatEventDateInChicago('2026-03-08T08:00:00.000Z')).toBe(
      'Sun, Mar 8, 3:00 AM'
    )
  })

  it('rejects nonexistent local times in the spring-forward gap', () => {
    expect(() => parseChicagoDatetimeLocalToIso('2026-03-08T02:30')).toThrow(
      /does not exist in Central Time because of daylight saving/i
    )
    expect(() =>
      chicagoWallTimeToUtcDate({
        year: 2026,
        month: 3,
        day: 8,
        hour: 2,
        minute: 0,
        second: 0,
      })
    ).toThrow(/does not exist in Central Time/i)
  })

  it('uses the earlier CDT occurrence for ambiguous fall-back times', () => {
    expect(parseChicagoDatetimeLocalToIso('2026-11-01T01:30')).toBe(
      '2026-11-01T06:30:00.000Z'
    )
    expect(formatEventDateInChicago('2026-11-01T06:30:00.000Z')).toBe(
      'Sun, Nov 1, 1:30 AM'
    )
  })

  it('round-trips create input through UTC storage and edit prefill', () => {
    const stored = parseChicagoDatetimeLocalToIso('2026-10-04T17:00')
    expect(stored).toBe('2026-10-04T22:00:00.000Z')

    const prefill = toChicagoDatetimeLocalValue(stored)
    expect(prefill).toBe('2026-10-04T17:00')

    const resaved = parseChicagoDatetimeLocalToIso(prefill)
    expect(resaved).toBe(stored)
    expect(formatEventDateInChicago(resaved!)).toBe('Sun, Oct 4, 5:00 PM')
  })

  it('formats the same Chicago wall time regardless of process timezone', () => {
    const iso = '2026-10-04T22:00:00.000Z'
    process.env.TZ = 'UTC'
    const utcEnv = formatEventDateInChicago(iso)
    process.env.TZ = 'Pacific/Honolulu'
    const honoluluEnv = formatEventDateInChicago(iso)
    process.env.TZ = 'America/New_York'
    const eastEnv = formatEventDateInChicago(iso)

    expect(utcEnv).toBe('Sun, Oct 4, 5:00 PM')
    expect(honoluluEnv).toBe('Sun, Oct 4, 5:00 PM')
    expect(eastEnv).toBe('Sun, Oct 4, 5:00 PM')
    expect(EVENT_TIME_ZONE).toBe('America/Chicago')
  })

  it('does not render a 5:00 PM Chicago event as 7:00 AM or 12:00 PM', () => {
    const display = formatEventDateInChicago('2026-10-04T22:00:00.000Z')
    expect(display).toBe('Sun, Oct 4, 5:00 PM')
    expect(display).not.toMatch(/7:00\s*AM/i)
    expect(display).not.toMatch(/12:00\s*PM/i)

    const naiveUtc = formatEventDateInChicago('2026-10-04T17:00:00.000Z')
    expect(naiveUtc).toBe('Sun, Oct 4, 12:00 PM')
    expect(parseChicagoDatetimeLocalToIso('2026-10-04T17:00')).not.toBe(
      '2026-10-04T17:00:00.000Z'
    )
  })

  it('preserves an already-zoned ISO instant without a second conversion', () => {
    expect(parseChicagoDatetimeLocalToIso('2026-10-04T22:00:00.000Z')).toBe(
      '2026-10-04T22:00:00.000Z'
    )
  })

  it('rejects empty or malformed datetime-local values', () => {
    expect(parseChicagoDatetimeLocalToIso('')).toBeNull()
    expect(parseChicagoDatetimeLocalToIso('   ')).toBeNull()
    expect(() => parseChicagoDatetimeLocalToIso('not-a-date')).toThrow(
      /valid date and time/i
    )
    expect(toChicagoDatetimeLocalValue(null)).toBe('')
    expect(toChicagoDatetimeLocalValue('not-a-date')).toBe('')
  })
})
