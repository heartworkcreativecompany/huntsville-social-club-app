import { describe, expect, it } from 'vitest'
import {
  DIRECTORY_FULL_FIELDS,
  PROFILE_COMPATIBILITY_FIELDS,
} from '@/lib/profile-query-fields'
import {
  datingAgeFieldErrors,
  datingAgePreferenceColumnPatch,
  directorySelectExcludesDatingAgePreferences,
  hasCompleteDatingAgePreferences,
  isMutualDatingAgeMatch,
  ownProfileCompatibilityWriteFilter,
  parseAdultAge,
  parseDatingAgePreferences,
  parseIntegerAgeInput,
  PREFERRED_MATCH_AGE_RANGE_LAYOUT_CLASS,
  preferredMatchAgeRangeSummary,
} from '@/lib/compatibility/age-preferences'
import {
  buildCompatibilityQuestionnaire,
  isCompatibilityQuestionnaireEffectivelyComplete,
  isQuestionnaireComplete,
  questionnaireAnswersFromStored,
  validateQuestionnaireAnswersForSave,
} from '@/lib/compatibility/questionnaire'
import type { CompatibilityQuestionnaireAnswers } from '@/lib/compatibility/questionnaire'
import { passesCompatibilityHardFilters } from '@/lib/compatibility/match-hard-filters'
import { canGenerateMatches } from '@/lib/compatibility/eligibility'
import { COMPATIBILITY_QUESTIONNAIRE_VERSION } from '@/lib/compatibility/questionnaire-config'
import type { CompatibilityQuestionnaireV2 } from '@/lib/compatibility/types'

const completeAnswers: CompatibilityQuestionnaireAnswers = {
  gender: 'woman',
  genderSelfDescribe: '',
  age: 32,
  preferredMatchAgeMin: 25,
  preferredMatchAgeMax: 45,
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
  stayingActiveImportant: 3,
  enjoyDancingSocially: 3,
  enjoyEdgyHumor: 3,
  preferLowKeyHangouts: 3,
  needStructureOrganization: 3,
  spontaneousPlanReady: 3,
  preferOneOnOne: 3,
  sharedValuesOverHobbies: 3,
  likePlayfulBanter: 3,
  loveLanguagesImportant: 3,
  extendedFamilyTimeImportant: 3,
  enjoyHostingGatherings: 3,
  drinkAlcoholRegularly: 3,
  smokeRegularly: 3,
  animalCompanyImportant: 3,
}

function questionnaire(
  overrides: Partial<CompatibilityQuestionnaireV2> = {}
): CompatibilityQuestionnaireV2 {
  return {
    version: COMPATIBILITY_QUESTIONNAIRE_VERSION,
    gender: 'woman',
    genderSelfDescribe: null,
    age: 32,
    preferredMatchAgeMin: 25,
    preferredMatchAgeMax: 45,
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
    stayingActiveImportant: 3,
    enjoyDancingSocially: 3,
    enjoyEdgyHumor: 3,
    preferLowKeyHangouts: 3,
    needStructureOrganization: 3,
    spontaneousPlanReady: 3,
    preferOneOnOne: 3,
    sharedValuesOverHobbies: 3,
    likePlayfulBanter: 3,
    loveLanguagesImportant: 3,
    extendedFamilyTimeImportant: 3,
    enjoyHostingGatherings: 3,
    drinkAlcoholRegularly: 3,
    smokeRegularly: 3,
    animalCompanyImportant: 3,
    ...overrides,
  }
}

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

describe('parseAdultAge', () => {
  it('accepts whole numbers from 18 through 99', () => {
    expect(parseAdultAge(18)).toBe(18)
    expect(parseAdultAge(99)).toBe(99)
    expect(parseAdultAge('42')).toBe(42)
  })

  it('rejects values below 18, above 99, blanks, and non-numeric input', () => {
    expect(parseAdultAge(17)).toBeNull()
    expect(parseAdultAge(100)).toBeNull()
    expect(parseAdultAge('')).toBeNull()
    expect(parseAdultAge('   ')).toBeNull()
    expect(parseAdultAge('abc')).toBeNull()
    expect(parseAdultAge('32.5')).toBeNull()
    expect(parseAdultAge(32.5)).toBeNull()
    expect(parseAdultAge(null)).toBeNull()
    expect(parseAdultAge(undefined)).toBeNull()
  })
})

describe('preferred match age range', () => {
  it('accepts 18–99 for minimum and maximum ages', () => {
    expect(
      parseDatingAgePreferences({
        age: 30,
        preferredMatchAgeMin: 18,
        preferredMatchAgeMax: 99,
      })
    ).toEqual({
      age: 30,
      preferredMatchAgeMin: 18,
      preferredMatchAgeMax: 99,
    })
  })

  it('rejects a minimum higher than the maximum', () => {
    expect(
      parseDatingAgePreferences({
        age: 30,
        preferredMatchAgeMin: 40,
        preferredMatchAgeMax: 35,
      })
    ).toBeNull()

    const errors = datingAgeFieldErrors({
      age: 30,
      preferredMatchAgeMin: 40,
      preferredMatchAgeMax: 35,
    })
    expect(errors.preferredMatchAgeRange).toMatch(/cannot be higher/i)
  })

  it('does not treat incomplete values as complete', () => {
    expect(hasCompleteDatingAgePreferences({ age: 30 })).toBe(false)
    expect(
      hasCompleteDatingAgePreferences({
        age: 30,
        preferredMatchAgeMin: 25,
        preferredMatchAgeMax: null,
      })
    ).toBe(false)
  })
})

describe('questionnaire age persistence', () => {
  it('persists and reloads age answers', () => {
    const stored = buildCompatibilityQuestionnaire(completeAnswers)
    const reloaded = questionnaireAnswersFromStored(stored)

    expect(stored.age).toBe(32)
    expect(stored.preferredMatchAgeMin).toBe(25)
    expect(stored.preferredMatchAgeMax).toBe(45)
    expect(reloaded.age).toBe(32)
    expect(reloaded.preferredMatchAgeMin).toBe(25)
    expect(reloaded.preferredMatchAgeMax).toBe(45)
  })

  it('rejects completing the questionnaire without valid ages', () => {
    expect(
      validateQuestionnaireAnswersForSave(
        { ...completeAnswers, age: null },
        true
      )
    ).toEqual({
      error: expect.stringContaining('How old are you?'),
    })

    expect(
      validateQuestionnaireAnswersForSave(
        {
          ...completeAnswers,
          preferredMatchAgeMin: 40,
          preferredMatchAgeMax: 30,
        },
        true
      )
    ).toEqual({
      error: expect.stringContaining('age range'),
    })
  })

  it('does not treat previously completed members as match-ready without ages', () => {
    const legacyComplete = buildCompatibilityQuestionnaire({
      ...completeAnswers,
      age: null,
      preferredMatchAgeMin: null,
      preferredMatchAgeMax: null,
    })

    expect(isQuestionnaireComplete(legacyComplete)).toBe(false)
    expect(
      isCompatibilityQuestionnaireEffectivelyComplete({
        compatibility_questionnaire: legacyComplete,
        compatibility_completed_at: '2026-01-01T00:00:00.000Z',
      })
    ).toBe(false)
    expect(datingAgePreferenceColumnPatch(legacyComplete)).toEqual({
      age: null,
      preferred_match_age_min: null,
      preferred_match_age_max: null,
    })
  })
})

describe('mutual age matching', () => {
  it('includes candidates when both ages fit the other person’s range', () => {
    expect(
      isMutualDatingAgeMatch(
        { age: 34, preferredMatchAgeMin: 30, preferredMatchAgeMax: 50 },
        { age: 41, preferredMatchAgeMin: 28, preferredMatchAgeMax: 40 }
      )
    ).toBe(true)

    expect(
      passesCompatibilityHardFilters(
        questionnaire({
          gender: 'woman',
          matchInterests: ['men'],
          age: 34,
          preferredMatchAgeMin: 30,
          preferredMatchAgeMax: 50,
        }),
        questionnaire({
          gender: 'man',
          matchInterests: ['women'],
          age: 41,
          preferredMatchAgeMin: 28,
          preferredMatchAgeMax: 40,
        })
      )
    ).toBe(true)
  })

  it('excludes candidates when only one direction fits', () => {
    expect(
      isMutualDatingAgeMatch(
        { age: 34, preferredMatchAgeMin: 30, preferredMatchAgeMax: 50 },
        { age: 41, preferredMatchAgeMin: 36, preferredMatchAgeMax: 50 }
      )
    ).toBe(false)

    expect(
      passesCompatibilityHardFilters(
        questionnaire({
          gender: 'woman',
          matchInterests: ['men'],
          age: 34,
          preferredMatchAgeMin: 30,
          preferredMatchAgeMax: 50,
        }),
        questionnaire({
          gender: 'man',
          matchInterests: ['women'],
          age: 41,
          preferredMatchAgeMin: 36,
          preferredMatchAgeMax: 50,
        })
      )
    ).toBe(false)
  })

  it('excludes candidates with missing or invalid age preference data', () => {
    expect(
      isMutualDatingAgeMatch(
        { age: 34, preferredMatchAgeMin: 30, preferredMatchAgeMax: 50 },
        { age: null, preferredMatchAgeMin: 28, preferredMatchAgeMax: 40 }
      )
    ).toBe(false)
  })

  it('keeps existing non-age hard filters in place', () => {
    expect(
      passesCompatibilityHardFilters(
        questionnaire({
          gender: 'woman',
          matchInterests: ['men'],
          age: 34,
          preferredMatchAgeMin: 18,
          preferredMatchAgeMax: 99,
        }),
        questionnaire({
          gender: 'man',
          matchInterests: ['men'],
          age: 36,
          preferredMatchAgeMin: 18,
          preferredMatchAgeMax: 99,
        })
      )
    ).toBe(false)
  })
})

describe('existing members without age columns', () => {
  it('does not generate dating recommendations until ages are complete', () => {
    const previous = process.env.COMPATIBILITY_MATCHING_ENABLED
    process.env.COMPATIBILITY_MATCHING_ENABLED = 'true'

    const stored = buildCompatibilityQuestionnaire({
      ...completeAnswers,
      age: null,
      preferredMatchAgeMin: null,
      preferredMatchAgeMax: null,
    })

    expect(
      canGenerateMatches(
        {
          application_status: 'approved',
          connection_intents: ['dating'],
          connections_open_to: ['New friends'],
          compatibility_questionnaire: stored,
          compatibility_completed_at: '2026-01-01T00:00:00.000Z',
          wants_curated_matches: true,
          curated_matches_paused_at: null,
          curated_matches_pause_reason: null,
          dating_connection_enabled_at: null,
          dating_connection_removed_at: null,
          messaging_entitlement_lost_at: null,
          messaging_entitlement_restored_at: null,
          role: 'member',
          membership_billing: innerCircleBilling,
        },
        { billing: innerCircleBilling }
      )
    ).toBe(false)

    if (previous === undefined) {
      delete process.env.COMPATIBILITY_MATCHING_ENABLED
    } else {
      process.env.COMPATIBILITY_MATCHING_ENABLED = previous
    }
  })
})

describe('privacy and authorization', () => {
  it('does not expose dating age columns through the directory select list', () => {
    expect(directorySelectExcludesDatingAgePreferences(DIRECTORY_FULL_FIELDS)).toBe(
      true
    )
    expect(DIRECTORY_FULL_FIELDS).not.toContain('preferred_match_age_min')
    expect(PROFILE_COMPATIBILITY_FIELDS).toContain('preferred_match_age_min')
  })

  it('scopes dating preference writes to the signed-in member', () => {
    const filter = ownProfileCompatibilityWriteFilter('member-a')
    expect(filter).toEqual({ column: 'id', value: 'member-a' })
    expect(filter.value).not.toBe('member-b')
  })
})

describe('mobile questionnaire layout', () => {
  it('stacks preferred age inputs on narrow widths', () => {
    expect(PREFERRED_MATCH_AGE_RANGE_LAYOUT_CLASS).toContain('grid-cols-1')
    expect(PREFERRED_MATCH_AGE_RANGE_LAYOUT_CLASS).toContain('sm:grid-cols-2')
    expect(PREFERRED_MATCH_AGE_RANGE_LAYOUT_CLASS).toContain('min-w-0')
  })

  it('parses typed numeric input without requiring a desktop picker', () => {
    expect(parseIntegerAgeInput('29')).toBe(29)
    expect(parseIntegerAgeInput('')).toBeNull()
    expect(parseIntegerAgeInput('2a')).toBeNull()
  })

  it('announces a clear preferred-range summary', () => {
    expect(preferredMatchAgeRangeSummary(28, 40)).toBe(
      'I’m open to matches ages 28 to 40.'
    )
  })
})
