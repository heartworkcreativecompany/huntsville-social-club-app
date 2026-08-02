import { describe, expect, it } from 'vitest'
import {
  EVENT_AT_CAPACITY_MESSAGE,
  isEventAtCapacity,
  parseAttendanceMax,
} from '@/lib/event-attendance'

describe('event attendance capacity', () => {
  it('parses blank as unlimited', () => {
    expect(parseAttendanceMax('')).toEqual({ value: null })
    expect(parseAttendanceMax('  ')).toEqual({ value: null })
    expect(parseAttendanceMax(null)).toEqual({ value: null })
  })

  it('accepts positive whole numbers only', () => {
    expect(parseAttendanceMax('1')).toEqual({ value: 1 })
    expect(parseAttendanceMax('25')).toEqual({ value: 25 })
    expect(parseAttendanceMax('0')).toMatchObject({ error: expect.any(String) })
    expect(parseAttendanceMax('-3')).toMatchObject({ error: expect.any(String) })
    expect(parseAttendanceMax('1.5')).toMatchObject({ error: expect.any(String) })
    expect(parseAttendanceMax('abc')).toMatchObject({ error: expect.any(String) })
  })

  it('detects capacity from going seats only', () => {
    expect(isEventAtCapacity(4, 5)).toBe(false)
    expect(isEventAtCapacity(5, 5)).toBe(true)
    expect(isEventAtCapacity(10, null)).toBe(false)
    expect(EVENT_AT_CAPACITY_MESSAGE).toBe('This event is at capacity.')
  })
})
