import { describe, expect, it } from 'vitest'
import { scoreCompatibilityPair } from '@/lib/compatibility/scoring'
import { COMPATIBILITY_QUESTIONNAIRE_VERSION } from '@/lib/compatibility/questionnaire-config'

const completeQuestionnaire = {
  version: COMPATIBILITY_QUESTIONNAIRE_VERSION,
  gender: 'woman' as const,
  genderSelfDescribe: null,
  matchInterests: ['men' as const],
  relationshipIntention: 2 as const,
  faithValues: 2 as const,
  valuesVsChemistry: 2 as const,
  partnershipDailyLife: 3 as const,
  socialRhythm: 3 as const,
  saturdayStyle: 3 as const,
  planningSpontaneity: 3 as const,
  ambition: 3 as const,
  maritalHistory: 1 as const,
  familySituation: ['no_children' as const],
  openToPartnerWithChildren: 4 as const,
  futureChildren: 2 as const,
  openToDivorced: 4 as const,
  partnerHistoryPreference: 3 as const,
}

const womanProfile = {
  compatibility_questionnaire: completeQuestionnaire,
  discovery_interests: ['Hiking', 'Live music'],
  location_area: 'Downtown Huntsville',
  birth_year: 1990,
}

const manProfile = {
  compatibility_questionnaire: {
    ...completeQuestionnaire,
    gender: 'man' as const,
    matchInterests: ['women' as const],
  },
  discovery_interests: ['Hiking', 'Live music'],
  location_area: 'Downtown Huntsville',
  birth_year: 1992,
}

describe('scoreCompatibilityPair', () => {
  it('scores aligned v2 questionnaires highly', () => {
    const result = scoreCompatibilityPair(womanProfile, manProfile)
    expect(result.score).toBeGreaterThanOrEqual(70)
    expect(result.breakdown.version).toBe('v2_questionnaire')
  })

  it('rewards shared interests and location', () => {
    const result = scoreCompatibilityPair(womanProfile, {
      ...manProfile,
      compatibility_questionnaire: {
        ...manProfile.compatibility_questionnaire,
        relationshipIntention: 4,
        planningSpontaneity: 5,
      },
      birth_year: 1992,
    })

    expect(result.score).toBeGreaterThanOrEqual(40)
    expect(result.breakdown.shared_interests).toBeGreaterThan(0)
    expect(result.breakdown.location).toBe(8)
  })

  it('returns zero when hard filters fail', () => {
    const result = scoreCompatibilityPair(womanProfile, {
      ...manProfile,
      compatibility_questionnaire: {
        ...manProfile.compatibility_questionnaire,
        matchInterests: ['men'],
      },
    })

    expect(result.score).toBe(0)
    expect(result.breakdown.hard_filter_failed).toBe(1)
  })

  it('returns zero for legacy test questionnaires', () => {
    const result = scoreCompatibilityPair(womanProfile, {
      compatibility_questionnaire: {
        version: 1,
        relationshipGoals: 'Casual networking only.',
        communicationStyle: 'Email and async messages.',
      },
      discovery_interests: ['Golf'],
      location_area: 'Nashville',
      birth_year: 1970,
    })

    expect(result.score).toBe(0)
    expect(result.breakdown.incomplete_questionnaire).toBe(1)
  })
})
