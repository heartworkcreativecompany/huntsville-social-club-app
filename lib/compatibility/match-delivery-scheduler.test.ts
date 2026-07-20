import { afterEach, describe, expect, it } from 'vitest'
import { isDueForMatchGeneration } from '@/lib/compatibility/match-delivery-scheduler'
import { GENERATION_INTERVAL_DAYS } from '@/lib/compatibility/generation-config'

describe('isDueForMatchGeneration', () => {
  it('treats members without a prior batch as due', () => {
    expect(isDueForMatchGeneration(null)).toBe(true)
    expect(isDueForMatchGeneration(undefined)).toBe(true)
  })

  it('waits until the generation interval has elapsed', () => {
    const now = new Date('2026-06-01T12:00:00.000Z').getTime()
    const recent = new Date(now)
    recent.setDate(recent.getDate() - (GENERATION_INTERVAL_DAYS - 1))

    expect(isDueForMatchGeneration(recent.toISOString(), now)).toBe(false)
  })

  it('marks members due after the generation interval', () => {
    const now = new Date('2026-06-01T12:00:00.000Z').getTime()
    const old = new Date(now)
    old.setDate(old.getDate() - GENERATION_INTERVAL_DAYS)

    expect(isDueForMatchGeneration(old.toISOString(), now)).toBe(true)
  })

  it('anchors empty reviews without successful delivery', () => {
    const now = new Date('2026-06-08T12:00:00.000Z').getTime()
    const recentReview = new Date(now)
    recentReview.setDate(recentReview.getDate() - (GENERATION_INTERVAL_DAYS - 1))

    expect(
      isDueForMatchGeneration(null, now, recentReview.toISOString())
    ).toBe(false)
  })
})
