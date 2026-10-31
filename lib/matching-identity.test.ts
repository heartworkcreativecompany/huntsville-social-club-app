import { afterEach, describe, expect, it } from 'vitest'
import {
  canGenerateMatches,
  isCompatibilityEligible,
} from '@/lib/compatibility/eligibility'
import { summarizeCompatibilityProfileStatus } from '@/lib/compatibility/profile-status'
import { isFriendshipMatchPoolCandidate } from '@/lib/friendship/candidate-pool'
import {
  canGenerateFriendshipMatches,
  evaluateFriendshipAccess,
} from '@/lib/friendship/eligibility'
import {
  MATCHING_IDENTITY_CTA,
  MATCHING_IDENTITY_HREF,
  MATCHING_IDENTITY_PENDING_DETAIL,
  MATCHING_IDENTITY_REQUIRED_DETAIL,
  MATCHING_IDENTITY_UNAVAILABLE_DETAIL,
  acceptedIdentityAllowsMatching,
  matchingIdentityGate,
  partitionMatchingPublication,
} from '@/lib/matching-identity'
import { COMPATIBILITY_QUESTIONNAIRE_V2_VERSION } from '@/lib/compatibility/questionnaire-config'
import { submittedFriendshipRow } from '@/lib/friendship/test-fixtures'
import type { CompatibilityProfileFields } from '@/lib/compatibility/types'

const innerBilling = {
  tier: 'inner_circle',
  subscription_status: 'active',
  plan: 'monthly',
  stripe_customer_id: 'cus_test',
  stripe_subscription_id: 'sub_test',
  stripe_price_id: 'price_inner_new',
  renewal_at: null,
  billing_period_start: null,
  billing_period_end: null,
  trial_end: null,
  cancelled_at: null,
  plan_change_pending: null,
  payment_failure: { active: false, since: null, reminder_sent_at: null },
  application_fee: { status: 'paid', paid_at: null },
}

const eliteBilling = { ...innerBilling, tier: 'elite_circle', stripe_price_id: 'price_elite_new' }
const legacyInnerBilling = { ...innerBilling, stripe_price_id: 'price_inner_legacy' }
const legacyEliteBilling = { ...eliteBilling, stripe_price_id: 'price_elite_legacy' }

const completeQuestionnaire = {
  version: COMPATIBILITY_QUESTIONNAIRE_V2_VERSION,
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

function datingProfile(
  overrides: Partial<CompatibilityProfileFields> = {}
): CompatibilityProfileFields {
  return {
    application_status: 'approved',
    connections_open_to: ['New friends'],
    connection_intents: ['dating'],
    compatibility_completed_at: '2026-01-01T00:00:00.000Z',
    compatibility_questionnaire: completeQuestionnaire,
    wants_curated_matches: true,
    curated_matches_paused_at: null,
    curated_matches_pause_reason: null,
    dating_connection_enabled_at: null,
    dating_connection_removed_at: null,
    messaging_entitlement_lost_at: null,
    messaging_entitlement_restored_at: null,
    ...overrides,
  }
}

describe('accepted identity for Circle matching', () => {
  afterEach(() => {
    delete process.env.COMPATIBILITY_MATCHING_ENABLED
    delete process.env.FRIENDSHIP_MATCHING_ENABLED
  })

  it('treats only a verified resolver result as matching identity', () => {
    expect(acceptedIdentityAllowsMatching('verified')).toBe(true)
    expect(acceptedIdentityAllowsMatching('unverified')).toBe(false)
    expect(acceptedIdentityAllowsMatching('unavailable')).toBe(false)
    expect(acceptedIdentityAllowsMatching(null)).toBe(false)
  })

  it('blocks paid Inner and Elite members until identity is accepted', () => {
    process.env.COMPATIBILITY_MATCHING_ENABLED = 'true'
    for (const billing of [innerBilling, eliteBilling, legacyInnerBilling, legacyEliteBilling]) {
      expect(
        canGenerateMatches(datingProfile(), {
          billing,
          acceptedIdentity: 'unverified',
        })
      ).toBe(false)
      expect(
        canGenerateMatches(datingProfile(), {
          billing,
          acceptedIdentity: 'verified',
        })
      ).toBe(true)
    }
  })

  it('does not let identity bypass tier, approval, or a paused member', () => {
    process.env.COMPATIBILITY_MATCHING_ENABLED = 'true'
    expect(
      isCompatibilityEligible(datingProfile({ application_status: 'submitted' }), {
        billing: innerBilling,
        acceptedIdentity: 'verified',
      })
    ).toBe(false)
    expect(
      canGenerateMatches(datingProfile(), {
        billing: { ...innerBilling, tier: 'member', subscription_status: 'none' },
        acceptedIdentity: 'verified',
      })
    ).toBe(false)
    expect(
      canGenerateMatches(
        datingProfile({ curated_matches_paused_at: '2026-01-02T00:00:00.000Z' }),
        { billing: eliteBilling, acceptedIdentity: 'verified' }
      )
    ).toBe(false)
  })

  it('requires both sides before publication and holds an unverified candidate', () => {
    const statuses = new Map([
      ['recipient', 'verified' as const],
      ['verified-candidate', 'verified' as const],
      ['stripe-only', 'verified' as const],
      ['in-person-only', 'verified' as const],
      ['unverified-candidate', 'unverified' as const],
    ])
    const publication = partitionMatchingPublication({
      recipientId: 'recipient',
      candidateIds: [
        'verified-candidate',
        'stripe-only',
        'in-person-only',
        'unverified-candidate',
      ],
      statuses,
    })
    expect(publication).toEqual({
      ok: true,
      publishIds: ['verified-candidate', 'stripe-only', 'in-person-only'],
      heldIds: ['unverified-candidate'],
    })

    const revoked = partitionMatchingPublication({
      recipientId: 'recipient',
      candidateIds: ['verified-candidate'],
      statuses: new Map([
        ['recipient', 'unverified'],
        ['verified-candidate', 'verified'],
      ]),
    })
    expect(revoked).toEqual({
      ok: true,
      publishIds: [],
      heldIds: ['verified-candidate'],
    })
  })

  it('fails closed when the identity lookup is unavailable', () => {
    expect(
      partitionMatchingPublication({
        recipientId: 'recipient',
        candidateIds: ['candidate'],
        statuses: null,
      })
    ).toEqual({ ok: false })
    expect(
      partitionMatchingPublication({
        recipientId: 'recipient',
        candidateIds: ['candidate'],
        statuses: new Map([
          ['recipient', 'unavailable'],
          ['candidate', 'verified'],
        ]),
      }).ok &&
        partitionMatchingPublication({
          recipientId: 'recipient',
          candidateIds: ['candidate'],
          statuses: new Map([
            ['recipient', 'unavailable'],
            ['candidate', 'verified'],
          ]),
        })
    ).toMatchObject({ publishIds: [] })
  })

  it('uses the active-membership copy only when membership is confirmed', () => {
    process.env.COMPATIBILITY_MATCHING_ENABLED = 'true'
    const unverified = summarizeCompatibilityProfileStatus({
      profile: datingProfile(),
      entitlementInput: { billing: innerBilling, acceptedIdentity: 'unverified' },
      acceptedIdentity: 'unverified',
      messagingSuspended: false,
    })
    expect(unverified.detail).toBe(MATCHING_IDENTITY_REQUIRED_DETAIL)
    expect(unverified.ctaLabel).toBe(MATCHING_IDENTITY_CTA)
    expect(unverified.ctaHref).toBe(MATCHING_IDENTITY_HREF)

    const pending = matchingIdentityGate({
      status: 'unverified',
      stripeStatus: 'processing',
      membershipConfirmedActive: true,
    })
    expect(pending.state).toBe('identity_pending')
    expect(pending.state === 'identity_pending' && pending.detail).toBe(
      MATCHING_IDENTITY_PENDING_DETAIL
    )

    const unavailable = summarizeCompatibilityProfileStatus({
      profile: datingProfile(),
      entitlementInput: { billing: eliteBilling },
      acceptedIdentity: 'unavailable',
    })
    expect(unavailable.status).toBe('identity_unavailable')
    expect(unavailable.detail).toBe(MATCHING_IDENTITY_UNAVAILABLE_DETAIL)
    expect(unavailable.detail).not.toContain('membership is active')

    const suspended = matchingIdentityGate({
      status: 'unverified',
      membershipConfirmedActive: false,
    })
    expect(suspended.state === 'identity_required' && suspended.detail).not.toContain(
      'membership is active'
    )
  })

  it('keeps friendship answers saveable and blocks new friend results without identity', () => {
    process.env.FRIENDSHIP_MATCHING_ENABLED = 'true'
    const blocked = evaluateFriendshipAccess({
      signedIn: true,
      approved: true,
      friendsIntent: true,
      entitlementInput: { billing: innerBilling, applicationApproved: true },
      questionnaire: submittedFriendshipRow(),
      acceptedIdentity: 'unverified',
    })
    expect(blocked.canMutate).toBe(true)
    expect(blocked.canViewForm).toBe(true)
    expect(blocked.canViewMatches).toBe(false)
    expect(blocked.canScore).toBe(false)
    expect(blocked.detail).toBe(MATCHING_IDENTITY_REQUIRED_DETAIL)

    expect(
      canGenerateFriendshipMatches(
        {
          application_status: 'approved',
          connection_intents: ['friends'],
        },
        { billing: eliteBilling, applicationApproved: true, acceptedIdentity: 'unverified' },
        submittedFriendshipRow()
      )
    ).toBe(false)
    expect(
      isFriendshipMatchPoolCandidate({
        application_status: 'approved',
        connection_intents: ['friends'],
        role: 'member',
        membership_billing: legacyInnerBilling,
        questionnaire: submittedFriendshipRow(),
        acceptedIdentity: 'verified',
      })
    ).toBe(true)
    expect(
      isFriendshipMatchPoolCandidate({
        application_status: 'approved',
        connection_intents: ['friends'],
        role: 'member',
        membership_billing: legacyEliteBilling,
        questionnaire: submittedFriendshipRow(),
        acceptedIdentity: 'unavailable',
      })
    ).toBe(false)
  })

  it('leaves friendship matching disabled when its feature flag is off', () => {
    delete process.env.FRIENDSHIP_MATCHING_ENABLED
    const access = evaluateFriendshipAccess({
      signedIn: true,
      approved: true,
      friendsIntent: true,
      entitlementInput: {
        billing: innerBilling,
        applicationApproved: true,
        acceptedIdentity: 'verified',
      },
      questionnaire: submittedFriendshipRow(),
      acceptedIdentity: 'verified',
    })
    expect(access.status).toBe('matching_unavailable')
    expect(
      canGenerateFriendshipMatches(
        {
          application_status: 'approved',
          connection_intents: ['friends'],
        },
        { billing: innerBilling, applicationApproved: true, acceptedIdentity: 'verified' },
        submittedFriendshipRow()
      )
    ).toBe(false)
  })
})
