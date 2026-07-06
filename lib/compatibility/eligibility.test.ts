import { afterEach, describe, expect, it } from 'vitest'
import {
  canGenerateMatches,
  isCompatibilityEligible,
  isCompatibilityFeatureEnabled,
} from '@/lib/compatibility/eligibility'
import type { CompatibilityProfileFields } from '@/lib/compatibility/types'

const innerCircleBilling = {
  tier: 'inner_circle',
  subscription_status: 'active',
  plan: 'monthly',
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
  application_fee: { status: 'paid', paid_at: null },
}

function baseProfile(
  overrides: Partial<CompatibilityProfileFields> = {}
): CompatibilityProfileFields {
  return {
    application_status: 'approved',
    connections_open_to: ['Dating'],
    compatibility_completed_at: null,
    wants_curated_matches: true,
    curated_matches_paused_at: null,
    curated_matches_pause_reason: null,
    dating_connection_enabled_at: null,
    dating_connection_removed_at: null,
    messaging_entitlement_lost_at: null,
    messaging_entitlement_restored_at: null,
    role: 'member',
    membership_billing: innerCircleBilling,
    ...overrides,
  }
}

describe('isCompatibilityFeatureEnabled', () => {
  afterEach(() => {
    delete process.env.COMPATIBILITY_MATCHING_ENABLED
  })

  it('returns false when env var is unset', () => {
    expect(isCompatibilityFeatureEnabled()).toBe(false)
  })

  it('returns true when env var is true', () => {
    process.env.COMPATIBILITY_MATCHING_ENABLED = 'true'
    expect(isCompatibilityFeatureEnabled()).toBe(true)
  })
})

describe('isCompatibilityEligible', () => {
  afterEach(() => {
    delete process.env.COMPATIBILITY_MATCHING_ENABLED
  })

  it('returns false when feature flag is off', () => {
    process.env.COMPATIBILITY_MATCHING_ENABLED = 'false'
    expect(
      isCompatibilityEligible(baseProfile(), {
        billing: innerCircleBilling,
      })
    ).toBe(false)
  })

  it('returns false for unapproved members', () => {
    process.env.COMPATIBILITY_MATCHING_ENABLED = 'true'
    expect(
      isCompatibilityEligible(baseProfile({ application_status: 'submitted' }), {
        billing: innerCircleBilling,
      })
    ).toBe(false)
  })

  it('returns false without Dating connection option', () => {
    process.env.COMPATIBILITY_MATCHING_ENABLED = 'true'
    expect(
      isCompatibilityEligible(baseProfile({ connections_open_to: ['New friends'] }), {
        billing: innerCircleBilling,
      })
    ).toBe(false)
  })

  it('returns false for free tier members', () => {
    process.env.COMPATIBILITY_MATCHING_ENABLED = 'true'
    expect(
      isCompatibilityEligible(baseProfile(), {
        billing: { ...innerCircleBilling, tier: 'member', subscription_status: 'none' },
      })
    ).toBe(false)
  })

  it('returns true for approved Dating Inner Circle members', () => {
    process.env.COMPATIBILITY_MATCHING_ENABLED = 'true'
    expect(
      isCompatibilityEligible(baseProfile(), {
        billing: innerCircleBilling,
      })
    ).toBe(true)
  })

  it('returns false when user manually paused matches', () => {
    process.env.COMPATIBILITY_MATCHING_ENABLED = 'true'
    expect(
      isCompatibilityEligible(baseProfile({ wants_curated_matches: false }), {
        billing: innerCircleBilling,
      })
    ).toBe(false)
  })
})

describe('canGenerateMatches', () => {
  afterEach(() => {
    delete process.env.COMPATIBILITY_MATCHING_ENABLED
  })

  it('returns false without completed questionnaire', () => {
    process.env.COMPATIBILITY_MATCHING_ENABLED = 'true'
    expect(
      canGenerateMatches(baseProfile(), {
        billing: innerCircleBilling,
      })
    ).toBe(false)
  })

  it('returns true when eligible and questionnaire complete', () => {
    process.env.COMPATIBILITY_MATCHING_ENABLED = 'true'
    expect(
      canGenerateMatches(
        baseProfile({ compatibility_completed_at: '2026-01-01T00:00:00.000Z' }),
        { billing: innerCircleBilling }
      )
    ).toBe(true)
  })

  it('returns false when paused', () => {
    process.env.COMPATIBILITY_MATCHING_ENABLED = 'true'
    expect(
      canGenerateMatches(
        baseProfile({
          compatibility_completed_at: '2026-01-01T00:00:00.000Z',
          curated_matches_paused_at: '2026-01-02T00:00:00.000Z',
        }),
        { billing: innerCircleBilling }
      )
    ).toBe(false)
  })
})

it('canGenerateMatches returns false when feature flag is off even if profile is otherwise eligible', () => {
  process.env.COMPABILITY_MATCHING_ENABLED = 'false';

  const profile = {
    applicationStatus: 'approved',
    connectionsOpenTo: ['Dating'],
    canMessage: true,
    wantsCuratedMatches: true,
    compatibilityCompletedAt: new Date(),
    curatedMatchesPausedAt: null,
  };

  expect(canGenerateMatches(profile)).toBe(false);
});

