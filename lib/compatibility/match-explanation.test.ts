import { describe, expect, it } from 'vitest'
import {
  deriveMatchExplanations,
  listSharedInterestLabels,
} from '@/lib/compatibility/match-explanation'

describe('listSharedInterestLabels', () => {
  it('returns shared public interest labels', () => {
    expect(
      listSharedInterestLabels(
        ['Hiking', 'Live music'],
        ['live music', 'Golf']
      )
    ).toEqual(['Live music'])
  })
})

describe('deriveMatchExplanations', () => {
  it('returns ranked abstract reasons from v1 score breakdown', () => {
    const explanations = deriveMatchExplanations({
      scoreBreakdown: {
        version: 'v1_simple',
        baseline: 40,
        communication_style: 20,
        relationship_goals: 15,
        shared_interests: 10,
        location: 10,
        age_proximity: 10,
      },
      candidateLocationArea: 'Downtown Huntsville',
      sharedInterestLabels: ['Hiking', 'Live music'],
    })

    expect(explanations).toContain('Strong shared values')
    expect(explanations).toContain('Similar relationship intentions')
    expect(explanations).toContain('Shared interests: Hiking and Live music')
    expect(explanations).toContain('Both in the Downtown Huntsville area')
    expect(explanations.length).toBeLessThanOrEqual(4)
  })

  it('returns ranked abstract reasons from v2 score breakdown', () => {
    const explanations = deriveMatchExplanations({
      scoreBreakdown: {
        version: 'v2_questionnaire',
        baseline: 20,
        relationshipIntention: 12,
        faithValues: 10,
        valuesVsChemistry: 8,
        partnershipDailyLife: 8,
        shared_interests: 10,
        location: 8,
        age_proximity: 8,
      },
      candidateLocationArea: 'Downtown Huntsville',
      sharedInterestLabels: ['Hiking'],
    })

    expect(explanations).toContain('Similar relationship intentions')
    expect(explanations).toContain('Strong shared values')
    expect(explanations).toContain('Shared interest: Hiking')
    expect(explanations.length).toBeGreaterThan(0)
  })

  it('omits weak signals', () => {
    const explanations = deriveMatchExplanations({
      scoreBreakdown: {
        version: 'v1_simple',
        baseline: 40,
        communication_style: 4,
        relationship_goals: 0,
        shared_interests: 0,
        location: 0,
        age_proximity: 0,
      },
    })

    expect(explanations).toEqual([])
  })

  it('does not expose questionnaire text', () => {
    const explanations = deriveMatchExplanations({
      scoreBreakdown: {
        relationshipIntention: 12,
        faithValues: 9,
      },
    })

    for (const explanation of explanations) {
      expect(explanation).not.toMatch(/texting|coffee|long-term/i)
    }
  })

  it('returns nothing for dev seed breakdowns', () => {
    expect(
      deriveMatchExplanations({
        scoreBreakdown: { source: 'dev_seed' },
      })
    ).toEqual([])
  })
})
