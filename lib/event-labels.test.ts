import { describe, expect, it } from 'vitest'
import { formatEventDate } from '@/lib/event-labels'
import { formatEventDateInChicago } from '@/lib/event-time'

describe('formatEventDate', () => {
  it('uses the centralized America/Chicago formatter', () => {
    const iso = '2026-10-04T22:00:00.000Z'
    expect(formatEventDate(iso)).toBe('Sun, Oct 4, 5:00 PM')
    expect(formatEventDate(iso)).toBe(formatEventDateInChicago(iso))
    expect(formatEventDate(iso)).not.toMatch(/7:00\s*AM/i)
    expect(formatEventDate(iso)).not.toMatch(/12:00\s*PM/i)
  })
})
