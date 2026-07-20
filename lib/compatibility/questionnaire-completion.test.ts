import { describe, expect, it } from 'vitest'
import {
  buildCompatibilityQuestionnaire,
  isCompatibilityQuestionnaireEffectivelyComplete,
  isQuestionnaireComplete,
  questionnaireAnswersFromStored,
  validateQuestionnaireAnswersForSave,
} from '@/lib/compatibility/questionnaire'
import type { CompatibilityQuestionnaireAnswers } from '@/lib/compatibility/questionnaire'

const completeAnswers: CompatibilityQuestionnaireAnswers = {
  gender: 'woman',
  genderSelfDescribe: '',
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
}

describe('questionnaire completion', () => {
  it('does not treat the legacy Phase 1 test scaffold as complete', () => {
    const legacy = {
      version: 1 as const,
      relationshipGoals: 'Long-term connection',
      communicationStyle: 'Coffee first',
    }

    expect(isQuestionnaireComplete(legacy)).toBe(false)
    expect(
      isCompatibilityQuestionnaireEffectivelyComplete({
        compatibility_questionnaire: legacy,
        compatibility_completed_at: '2026-01-01T00:00:00.000Z',
      })
    ).toBe(false)
  })

  it('requires every real question before completion', () => {
    const partial = buildCompatibilityQuestionnaire({
      ...completeAnswers,
      futureChildren: null,
    })

    expect(isQuestionnaireComplete(partial)).toBe(false)
    expect(
      validateQuestionnaireAnswersForSave(
        { ...completeAnswers, futureChildren: null },
        true
      )
    ).toEqual({
      error: expect.stringContaining('hopes around having children'),
    })
  })

  it('accepts a full v2 questionnaire as complete', () => {
    const questionnaire = buildCompatibilityQuestionnaire(completeAnswers)

    expect(isQuestionnaireComplete(questionnaire)).toBe(true)
    expect(
      isCompatibilityQuestionnaireEffectivelyComplete({
        compatibility_questionnaire: questionnaire,
        compatibility_completed_at: '2026-01-01T00:00:00.000Z',
      })
    ).toBe(true)
  })

  it('preserves legacy free-text answers when upgrading from v1', () => {
    const questionnaire = buildCompatibilityQuestionnaire(completeAnswers, {
      version: 1,
      relationshipGoals: 'Thoughtful long-term dating',
      communicationStyle: 'Coffee first',
    })

    expect(questionnaire.legacyRelationshipGoals).toBe(
      'Thoughtful long-term dating'
    )
    expect(questionnaire.legacyCommunicationStyle).toBe('Coffee first')
  })

  it('round-trips stored answers into form state', () => {
    const stored = buildCompatibilityQuestionnaire(completeAnswers)
    const answers = questionnaireAnswersFromStored(stored)

    expect(answers.gender).toBe('woman')
    expect(answers.matchInterests).toEqual(['men'])
    expect(answers.relationshipIntention).toBe(2)
    expect(answers.familySituation).toEqual(['no_children'])
  })
})
