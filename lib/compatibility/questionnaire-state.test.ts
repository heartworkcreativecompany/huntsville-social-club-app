import { afterEach, describe, expect, it } from 'vitest'
import { canGenerateMatches } from '@/lib/compatibility/eligibility'
import { summarizeCompatibilityProfileStatus } from '@/lib/compatibility/profile-status'
import {
  buildCompatibilityQuestionnaire,
  isCompatibilityQuestionnaireEffectivelyComplete,
  isQuestionnaireComplete,
  normalizeMatchInterests,
  questionnaireAnswersFromStored,
  questionnaireValidationMessage,
  resolveCompatibilityQuestionnaireState,
  validateQuestionnaireAnswersForSave,
} from '@/lib/compatibility/questionnaire'
import type { CompatibilityQuestionnaireAnswers } from '@/lib/compatibility/questionnaire'

const innerCircleBilling = {
  tier: 'inner_circle' as const,
  subscription_status: 'active' as const,
  plan: 'monthly' as const,
  stripe_customer_id: 'cus_test',
  stripe_subscription_id: 'sub_test',
  stripe_price_id: 'price_test',
  renewal_at: null,
  billing_period_start: null,
  billing_period_end: null,
  trial_end: null,
  cancelled_at: null,
  plan_change_pending: null,
  payment_failure: { active: false, since: null, reminder_sent_at: null },
  application_fee: { status: 'paid' as const, paid_at: null },
}

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

const baseProfile = {
  application_status: 'approved' as const,
  connection_intents: ['dating'],
  wants_curated_matches: true,
  curated_matches_paused_at: null,
  curated_matches_pause_reason: null,
  dating_connection_enabled_at: null,
  dating_connection_removed_at: null,
  messaging_entitlement_lost_at: null,
  messaging_entitlement_restored_at: null,
  role: 'member',
  membership_billing: innerCircleBilling,
}

describe('resolveCompatibilityQuestionnaireState', () => {
  it('classifies fresh, legacy, partial, and complete users consistently', () => {
    expect(resolveCompatibilityQuestionnaireState({})).toBe('empty')

    expect(
      resolveCompatibilityQuestionnaireState({
        compatibility_questionnaire: {
          version: 1,
          relationshipGoals: 'Test',
          communicationStyle: 'Test',
        },
        compatibility_completed_at: '2026-01-01T00:00:00.000Z',
      })
    ).toBe('legacy_v1')

    const partial = buildCompatibilityQuestionnaire({
      ...completeAnswers,
      relationshipIntention: null,
    })

    expect(
      resolveCompatibilityQuestionnaireState({
        compatibility_questionnaire: partial,
        compatibility_completed_at: null,
      })
    ).toBe('in_progress')

    const complete = buildCompatibilityQuestionnaire(completeAnswers)
    expect(
      resolveCompatibilityQuestionnaireState({
        compatibility_questionnaire: complete,
        compatibility_completed_at: '2026-01-01T00:00:00.000Z',
      })
    ).toBe('complete')
  })
})

describe('save progress vs complete', () => {
  it('allows partial saves without marking complete', () => {
    const partialAnswers = {
      ...completeAnswers,
      relationshipIntention: null,
      faithValues: null,
    }

    const result = validateQuestionnaireAnswersForSave(partialAnswers, false)
    expect('questionnaire' in result).toBe(true)
    if ('questionnaire' in result) {
      expect(isQuestionnaireComplete(result.questionnaire)).toBe(false)
    }
  })

  it('merges partial saves with existing answers instead of dropping them', () => {
    const existing = buildCompatibilityQuestionnaire({
      ...completeAnswers,
      relationshipIntention: 2,
      faithValues: 2,
      valuesVsChemistry: null,
    })

    const next = buildCompatibilityQuestionnaire(
      {
        ...completeAnswers,
        relationshipIntention: null,
        faithValues: null,
        valuesVsChemistry: 3,
      },
      existing
    )

    expect(next.relationshipIntention).toBe(2)
    expect(next.faithValues).toBe(2)
    expect(next.valuesVsChemistry).toBe(3)
  })

  it('returns field-specific validation errors on complete', () => {
    const questionnaire = buildCompatibilityQuestionnaire({
      ...completeAnswers,
      gender: 'self_describe',
      genderSelfDescribe: '',
    })

    const message = questionnaireValidationMessage(questionnaire)
    expect(message).toContain('Self-describe gender')
  })
})

describe('branching and field rules', () => {
  it('normalizes open_to_all as exclusive in saved payload', () => {
    expect(
      normalizeMatchInterests(['women', 'open_to_all', 'men'])
    ).toEqual(['open_to_all'])
  })

  it('round-trips exclusive open_to_all after reload', () => {
    const stored = buildCompatibilityQuestionnaire({
      ...completeAnswers,
      matchInterests: ['women', 'open_to_all'],
    })
    const answers = questionnaireAnswersFromStored(stored)
    expect(answers.matchInterests).toEqual(['open_to_all'])
  })

  it('rejects prefer_not_to_say-only family situation on complete', () => {
    const result = validateQuestionnaireAnswersForSave(
      {
        ...completeAnswers,
        familySituation: ['prefer_not_to_say'],
      },
      true
    )

    expect(result).toEqual({
      error: expect.stringContaining('Prefer not to say'),
    })
  })

  it('does not require self-describe when gender is not self_describe', () => {
    const questionnaire = buildCompatibilityQuestionnaire({
      ...completeAnswers,
      gender: 'woman',
      genderSelfDescribe: '',
    })

    expect(isQuestionnaireComplete(questionnaire)).toBe(true)
  })
})

describe('status and eligibility synchronization', () => {
  afterEach(() => {
    delete process.env.COMPATIBILITY_MATCHING_ENABLED
  })

  it('keeps profile status, effective completion, and canGenerateMatches aligned', () => {
    process.env.COMPATIBILITY_MATCHING_ENABLED = 'true'
    const complete = buildCompatibilityQuestionnaire(completeAnswers)
    const profile = {
      ...baseProfile,
      compatibility_questionnaire: complete,
      compatibility_completed_at: '2026-01-01T00:00:00.000Z',
    }

    expect(isCompatibilityQuestionnaireEffectivelyComplete(profile)).toBe(true)
    expect(
      canGenerateMatches(profile, { billing: innerCircleBilling })
    ).toBe(true)
    expect(
      summarizeCompatibilityProfileStatus({
        profile,
        entitlementInput: { billing: innerCircleBilling },
      }).status
    ).toBe('active')
  })

  it('treats legacy v1 completion timestamps as in progress across status surfaces', () => {
    process.env.COMPATIBILITY_MATCHING_ENABLED = 'true'
    const profile = {
      ...baseProfile,
      compatibility_questionnaire: {
        version: 1,
        relationshipGoals: 'Long-term',
        communicationStyle: 'Direct',
      },
      compatibility_completed_at: '2026-01-01T00:00:00.000Z',
    }

    expect(isCompatibilityQuestionnaireEffectivelyComplete(profile)).toBe(false)
    expect(
      canGenerateMatches(profile, { billing: innerCircleBilling })
    ).toBe(false)
    expect(
      summarizeCompatibilityProfileStatus({
        profile,
        entitlementInput: { billing: innerCircleBilling },
      }).status
    ).toBe('questionnaire_in_progress')
  })
})

describe('edit after complete', () => {
  it('preserves completion when updating an already-complete questionnaire', () => {
    const existing = buildCompatibilityQuestionnaire(completeAnswers)
    const updated = buildCompatibilityQuestionnaire(
      {
        ...completeAnswers,
        socialRhythm: 4,
      },
      existing
    )

    expect(isQuestionnaireComplete(updated)).toBe(true)
    expect(updated.socialRhythm).toBe(4)
    expect(updated.relationshipIntention).toBe(2)
  })
})
