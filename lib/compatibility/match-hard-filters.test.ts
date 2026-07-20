import { describe, expect, it } from 'vitest'
import { hasMutualGenderInterest } from '@/lib/compatibility/match-hard-filters'
import { COMPATIBILITY_QUESTIONNAIRE_VERSION } from '@/lib/compatibility/questionnaire-config'
import type { CompatibilityQuestionnaireV2 } from '@/lib/compatibility/types'

function questionnaire(
  overrides: Partial<CompatibilityQuestionnaireV2> = {}
): CompatibilityQuestionnaireV2 {
  return {
    version: COMPATIBILITY_QUESTIONNAIRE_VERSION,
    gender: 'woman',
    genderSelfDescribe: null,
    matchInterests: ['men'],
    relationshipIntention: 2,
    faithValues: 2,
    valuesVsChemistry: 2,
    partnershipDailyLife: 3,
    socialRhythm: 3,
    saturdayStyle: 3,
    planningSpontaneity: 3,
    ambition: 3,
    maritalHistory: 1,
    familySituation: ['no_children'],
    openToPartnerWithChildren: 4,
    futureChildren: 2,
    openToDivorced: 4,
    partnerHistoryPreference: 3,
    ...overrides,
  }
}

describe('hasMutualGenderInterest', () => {
  it('returns true for mutually compatible gender-interest settings', () => {
    expect(
      hasMutualGenderInterest(
        questionnaire({ gender: 'woman', matchInterests: ['men'] }),
        questionnaire({ gender: 'man', matchInterests: ['women'] })
      )
    ).toBe(true)
  })

  it('returns false when only one side is interested', () => {
    expect(
      hasMutualGenderInterest(
        questionnaire({ gender: 'woman', matchInterests: ['men'] }),
        questionnaire({ gender: 'man', matchInterests: ['men'] })
      )
    ).toBe(false)
  })
})
