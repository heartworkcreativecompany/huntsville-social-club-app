import { describe, expect, it } from 'vitest'
import {
  FRIENDSHIP_BASE_DIMENSION_WEIGHTS,
  FRIENDSHIP_PRIORITY_BOOST,
  boostedDimensionWeights,
  jaccardSimilarity,
  nearMatchSimilarity,
  scoreFriendshipPair,
  timeTogetherSimilarity,
} from '@/lib/friendship/scoring'
import { completeFriendshipQuestionnaire } from '@/lib/friendship/test-fixtures'

describe('friendship scoring primitives', () => {
  it('uses absolute-distance similarity for 1–5 values', () => {
    expect(1 - Math.abs(5 - 5) / 4).toBe(1)
    expect(1 - Math.abs(5 - 1) / 4).toBe(0)
    expect(1 - Math.abs(5 - 4) / 4).toBe(0.75)
  })

  it('uses Jaccard similarity for multi-select overlap', () => {
    expect(jaccardSimilarity(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3)
    expect(jaccardSimilarity(['a'], ['a'])).toBe(1)
    expect(jaccardSimilarity([], ['a'])).toBeNull()
  })

  it('uses exact/near-match similarity for time together', () => {
    expect(timeTogetherSimilarity('once_week', 'once_week')).toBe(1)
    expect(timeTogetherSimilarity('once_week', 'few_times_month')).toBe(0.7)
    expect(timeTogetherSimilarity('flexible', 'once_week')).toBe(0.75)
    expect(nearMatchSimilarity(5, 5)).toBe(1)
    expect(nearMatchSimilarity(5, 4)).toBe(0.7)
    expect(nearMatchSimilarity(5, 1)).toBe(0)
  })

  it('boosts viewer priority dimensions by 1.25× then renormalizes', () => {
    const boosted = boostedDimensionWeights(['communication_reliability', 'shared_interests'])
    const total = Object.values(boosted).reduce((sum, value) => sum + value, 0)
    expect(total).toBeCloseTo(1)
    expect(boosted.communication).toBeGreaterThan(
      FRIENDSHIP_BASE_DIMENSION_WEIGHTS.communication
    )
    expect(boosted.social).toBeGreaterThan(FRIENDSHIP_BASE_DIMENSION_WEIGHTS.social)
    expect(boosted.values).toBeLessThan(FRIENDSHIP_BASE_DIMENSION_WEIGHTS.values)
    expect(FRIENDSHIP_PRIORITY_BOOST).toBe(1.25)
  })
})

describe('scoreFriendshipPair', () => {
  it('scores identical complete questionnaires at 100', () => {
    const questionnaire = completeFriendshipQuestionnaire()
    const result = scoreFriendshipPair(questionnaire, questionnaire)
    expect(result.score).toBe(100)
    expect(result.breakdown.version).toBe('friendship_v1')
  })

  it('returns 0 for incomplete questionnaires', () => {
    const result = scoreFriendshipPair(
      completeFriendshipQuestionnaire(),
      { version: 1, friendshipGoals: ['one_on_one'] }
    )
    expect(result.score).toBe(0)
    expect(result.breakdown.incomplete_questionnaire).toBe(1)
  })

  it('does not penalize prefer-not-to-answer alcohol fields', () => {
    const left = completeFriendshipQuestionnaire({
      alcoholFrequency: 'prefer_not_to_answer',
      alcoholComfort: 'prefer_not_to_answer',
    })
    const right = completeFriendshipQuestionnaire({
      alcoholFrequency: 'often',
      alcoholComfort: 'very_comfortable',
    })
    const sameExceptAlcohol = scoreFriendshipPair(left, right)
    const bothPna = scoreFriendshipPair(left, left)
    expect(sameExceptAlcohol.score).toBe(bothPna.score)
    expect(sameExceptAlcohol.breakdown.items).not.toHaveProperty('alcoholFrequency')
    expect(sameExceptAlcohol.breakdown.items).not.toHaveProperty('alcoholComfort')
  })

  it('lowers the score when lifestyle answers diverge', () => {
    const aligned = completeFriendshipQuestionnaire()
    const divergent = completeFriendshipQuestionnaire({
      stayActiveOutside: 1,
      enjoyLowKeyHangouts: 1,
      likeNightlife: 5,
      preferStructuredSchedule: 1,
      openToLastMinutePlans: 1,
      petsImportant: 1,
      enjoyHosting: 1,
    })
    const close = scoreFriendshipPair(aligned, aligned)
    const far = scoreFriendshipPair(aligned, divergent)
    expect(far.score).toBeLessThan(close.score)
    expect(far.score).toBeGreaterThan(0)
  })

  it('applies a private viewer-only priority boost without using the candidate’s priorities', () => {
    const viewer = completeFriendshipQuestionnaire({
      friendshipPriorities: ['similar_lifestyle'],
      stayActiveOutside: 5,
      enjoyLowKeyHangouts: 5,
    })
    const candidate = completeFriendshipQuestionnaire({
      friendshipPriorities: ['humor_personality'],
      stayActiveOutside: 1,
      enjoyLowKeyHangouts: 1,
    })
    const boosted = scoreFriendshipPair(viewer, candidate)
    const unboostedViewer = completeFriendshipQuestionnaire({
      friendshipPriorities: ['humor_personality'],
      stayActiveOutside: 5,
      enjoyLowKeyHangouts: 5,
    })
    const unboosted = scoreFriendshipPair(unboostedViewer, candidate)
    expect(boosted.score).toBeLessThan(unboosted.score)
  })

  it('does not use protected traits as score inputs', () => {
    const result = scoreFriendshipPair(
      completeFriendshipQuestionnaire(),
      completeFriendshipQuestionnaire()
    )
    const keys = Object.keys(result.breakdown)
    expect(keys.join(' ')).not.toMatch(/race|religion|politic|sexual|disabilit/i)
  })
})
