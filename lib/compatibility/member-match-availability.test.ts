import { afterEach, describe, expect, it } from 'vitest'
import {
  deriveMemberInboxSituation,
  summarizeMemberMatchAvailability,
} from '@/lib/compatibility/member-match-availability'

const completedAt = '2026-07-01T12:00:00.000Z'
const lastDelivery = '2026-07-01T12:00:00.000Z'

function baseInput(
  overrides: Partial<Parameters<typeof deriveMemberInboxSituation>[0]> = {}
) {
  return {
    lastMatchGenerationAt: null,
    compatibilityCompletedAt: completedAt,
    latestBatch: null,
    activeRecommendationCount: 0,
    archivedRecommendationCount: 0,
    messagingSuspended: false,
    now: Date.parse('2026-07-02T12:00:00.000Z'),
    ...overrides,
  }
}

describe('deriveMemberInboxSituation', () => {
  it('detects active recommendations', () => {
    expect(
      deriveMemberInboxSituation(
        baseInput({ activeRecommendationCount: 2 })
      )
    ).toBe('has_active')
  })

  it('detects archived-only inbox', () => {
    expect(
      deriveMemberInboxSituation(
        baseInput({ archivedRecommendationCount: 1 })
      )
    ).toBe('archived_only')
  })

  it('detects first-time review in progress', () => {
    expect(deriveMemberInboxSituation(baseInput())).toBe('finding_matches')
  })

  it('detects empty batch with no strong matches', () => {
    expect(
      deriveMemberInboxSituation(
        baseInput({
          latestBatch: {
            status: 'empty',
            deliveredAt: '2026-07-02T10:00:00.000Z',
            createdAt: '2026-07-02T10:00:00.000Z',
            emptyReason:
              'No candidates met the minimum compatibility score (55%). Best available score was 42%.',
            matchCount: 0,
          },
        })
      )
    ).toBe('no_strong_matches')
  })

  it('detects waiting between delivery cycles', () => {
    expect(
      deriveMemberInboxSituation(
        baseInput({
          lastMatchGenerationAt: lastDelivery,
          lastMatchReviewAt: lastDelivery,
          now: Date.parse('2026-07-03T12:00:00.000Z'),
        })
      )
    ).toBe('waiting_for_next')
  })

  it('detects messaging suspension', () => {
    expect(
      deriveMemberInboxSituation(
        baseInput({ messagingSuspended: true })
      )
    ).toBe('messaging_suspended')
  })
})

describe('summarizeMemberMatchAvailability', () => {
  afterEach(() => {
    delete process.env.CURATED_MATCH_GENERATION_INTERVAL_DAYS
  })

  it('includes delivery lines for active inbox', () => {
    const summary = summarizeMemberMatchAvailability(
      baseInput({
        activeRecommendationCount: 1,
        lastMatchGenerationAt: lastDelivery,
      })
    )

    expect(summary.headline).toContain('active')
    expect(summary.deliveryLines.some((line) => line.includes('Last match delivery'))).toBe(
      true
    )
  })

  it('explains empty batch results in member-friendly language', () => {
    const summary = summarizeMemberMatchAvailability(
      baseInput({
        latestBatch: {
          status: 'empty',
          deliveredAt: '2026-07-02T10:00:00.000Z',
          createdAt: '2026-07-02T10:00:00.000Z',
          emptyReason: 'No eligible candidates were available in the match pool.',
          matchCount: 0,
        },
      })
    )

    expect(summary.situation).toBe('no_strong_matches')
    expect(summary.emptyDescription).toContain('dating match pool')
  })
})
