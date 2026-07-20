import { describe, expect, it } from 'vitest'
import { pairBlocksNewRecommendation } from '@/lib/curated-recommendation-lifecycle'
import { RE_RECOMMEND_COOLDOWN_DAYS } from '@/lib/compatibility/recommendation-lifecycle-config'

describe('pairBlocksNewRecommendation', () => {
  it('blocks active recommendations', () => {
    expect(
      pairBlocksNewRecommendation({
        recommended_user_id: 'a',
        status: 'pending',
        created_at: '2026-01-01T00:00:00.000Z',
        lifecycle_updated_at: null,
      })
    ).toBe(true)
  })

  it('blocks declined pairs during cooldown', () => {
    const recent = new Date()
    recent.setDate(recent.getDate() - 10)

    expect(
      pairBlocksNewRecommendation({
        recommended_user_id: 'a',
        status: 'declined',
        created_at: '2025-01-01T00:00:00.000Z',
        lifecycle_updated_at: recent.toISOString(),
      })
    ).toBe(true)
  })

  it('blocks passed pairs during cooldown', () => {
    const recent = new Date()
    recent.setDate(recent.getDate() - 10)

    expect(
      pairBlocksNewRecommendation({
        recommended_user_id: 'a',
        status: 'passed',
        created_at: '2025-01-01T00:00:00.000Z',
        lifecycle_updated_at: recent.toISOString(),
      })
    ).toBe(true)
  })

  it('allows passed pairs after cooldown', () => {
    const old = new Date()
    old.setDate(old.getDate() - (RE_RECOMMEND_COOLDOWN_DAYS + 1))

    expect(
      pairBlocksNewRecommendation({
        recommended_user_id: 'a',
        status: 'passed',
        created_at: '2025-01-01T00:00:00.000Z',
        lifecycle_updated_at: old.toISOString(),
      })
    ).toBe(false)
  })

  it('allows expired pairs after cooldown', () => {
    const old = new Date()
    old.setDate(old.getDate() - (RE_RECOMMEND_COOLDOWN_DAYS + 1))

    expect(
      pairBlocksNewRecommendation({
        recommended_user_id: 'a',
        status: 'expired',
        created_at: '2025-01-01T00:00:00.000Z',
        lifecycle_updated_at: old.toISOString(),
      })
    ).toBe(false)
  })
})
