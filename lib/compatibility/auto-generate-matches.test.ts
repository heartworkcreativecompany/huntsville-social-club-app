import { afterEach, describe, expect, it } from 'vitest'
import { canAttemptAutoGenerate } from '@/lib/compatibility/auto-generate-guards'
import type { MatchPoolProfile } from '@/lib/compatibility/match-candidate-pool'
import { generationIntervalDays } from '@/lib/compatibility/generation-config'

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

import { COMPATIBILITY_QUESTIONNAIRE_VERSION } from '@/lib/compatibility/questionnaire-config'

const completeQuestionnaire = {
  version: COMPATIBILITY_QUESTIONNAIRE_VERSION,
  gender: 'woman' as const,
  genderSelfDescribe: null,
  age: 32,
  preferredMatchAgeMin: 25,
  preferredMatchAgeMax: 45,
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
  stayingActiveImportant: 3 as const,
  enjoyDancingSocially: 3 as const,
  enjoyEdgyHumor: 3 as const,
  preferLowKeyHangouts: 3 as const,
  needStructureOrganization: 3 as const,
  spontaneousPlanReady: 3 as const,
  preferOneOnOne: 3 as const,
  sharedValuesOverHobbies: 3 as const,
  likePlayfulBanter: 3 as const,
  loveLanguagesImportant: 3 as const,
  extendedFamilyTimeImportant: 3 as const,
  enjoyHostingGatherings: 3 as const,
  drinkAlcoholRegularly: 3 as const,
  smokeRegularly: 3 as const,
  animalCompanyImportant: 3 as const,
}

function baseProfile(
  overrides: Partial<MatchPoolProfile> = {}
): MatchPoolProfile {
  return {
    id: 'member-1',
    application_status: 'approved',
    connection_intents: ['dating'],
    compatibility_questionnaire: completeQuestionnaire,
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
    discovery_interests: ['hiking'],
    location_area: 'Huntsville',
    birth_year: 1990,
    messaging_suspended_at: null,
    last_match_generation_at: null,
    last_match_review_at: null,
    ...overrides,
  }
}

describe('canAttemptAutoGenerate', () => {
  afterEach(() => {
    delete process.env.COMPATIBILITY_MATCHING_ENABLED
  })

  it('allows a fully eligible member with no prior delivery', () => {
    process.env.COMPATIBILITY_MATCHING_ENABLED = 'true'
    expect(canAttemptAutoGenerate(baseProfile()).ok).toBe(true)
  })

  it('blocks when feature flag is off', () => {
    expect(canAttemptAutoGenerate(baseProfile()).ok).toBe(false)
  })

  it('blocks when member is inside the delivery interval', () => {
    process.env.COMPATIBILITY_MATCHING_ENABLED = 'true'
    const days = generationIntervalDays()
    const recent = new Date(
      Date.now() - (days - 1) * 24 * 60 * 60 * 1000
    ).toISOString()

    const result = canAttemptAutoGenerate(
      baseProfile({ last_match_generation_at: recent })
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toContain('delivery interval')
    }
  })

  it('blocks when questionnaire is incomplete', () => {
    process.env.COMPATIBILITY_MATCHING_ENABLED = 'true'
    const result = canAttemptAutoGenerate(
      baseProfile({ compatibility_completed_at: null })
    )

    expect(result.ok).toBe(false)
  })
})
