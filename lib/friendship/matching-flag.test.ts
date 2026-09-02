import { afterEach, describe, expect, it } from 'vitest'
import {
  FRIENDSHIP_MATCHING_UNAVAILABLE_BODY,
  FRIENDSHIP_MATCHING_UNAVAILABLE_HEADING,
  assertCanMutateFriendshipQuestionnaire,
  assertCanScoreFriendshipQuestionnaire,
  canGenerateFriendshipMatches,
  evaluateFriendshipAccess,
  isFriendshipMatchingEnabled,
} from '@/lib/friendship/eligibility'
import { isCompatibilityFeatureEnabled } from '@/lib/compatibility/eligibility'
import {
  friendshipCronShouldRefresh,
  resolveFriendshipMatchesView,
} from '@/lib/friendship/matching-flag'
import { isFriendshipMatchPoolCandidate } from '@/lib/friendship/candidate-pool'
import {
  refreshFriendshipRecommendationsForAllEligible,
  refreshFriendshipRecommendationsForUser,
  rescoreFriendshipRecommendationsInvolving,
} from '@/lib/friendship/generate-recommendations'
import { loadFriendshipMatchPool } from '@/lib/friendship/candidate-pool'
import { loadFriendshipMatchRecommendations } from '@/lib/friendship/load-matches'
import {
  freeMemberBilling,
  innerCircleBilling,
  submittedFriendshipRow,
} from '@/lib/friendship/test-fixtures'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

const paidEntitlement = { billing: innerCircleBilling, applicationApproved: true }

function throwingClient(): SupabaseClient<Database> {
  return new Proxy(
    {},
    {
      get() {
        throw new Error('Supabase should not be queried when matching is disabled.')
      },
    }
  ) as SupabaseClient<Database>
}

const poolProfile = {
  application_status: 'approved',
  connection_intents: ['friends'],
  role: 'member',
  membership_billing: innerCircleBilling,
  messaging_suspended_at: null,
  questionnaire: submittedFriendshipRow(),
}

describe('FRIENDSHIP_MATCHING_ENABLED', () => {
  afterEach(() => {
    delete process.env.FRIENDSHIP_MATCHING_ENABLED
    delete process.env.COMPATIBILITY_MATCHING_ENABLED
  })

  it('defaults to disabled when the env var is absent', () => {
    expect(isFriendshipMatchingEnabled()).toBe(false)
  })

  it('defaults to disabled when the env var is not exactly true', () => {
    process.env.FRIENDSHIP_MATCHING_ENABLED = 'false'
    expect(isFriendshipMatchingEnabled()).toBe(false)
    process.env.FRIENDSHIP_MATCHING_ENABLED = 'TRUE'
    expect(isFriendshipMatchingEnabled()).toBe(false)
  })

  it('enables only when the env var is exactly true', () => {
    process.env.FRIENDSHIP_MATCHING_ENABLED = 'true'
    expect(isFriendshipMatchingEnabled()).toBe(true)
  })

  it('does not change Dating COMPATIBILITY_MATCHING_ENABLED behavior', () => {
    process.env.FRIENDSHIP_MATCHING_ENABLED = 'true'
    expect(isCompatibilityFeatureEnabled()).toBe(false)
    process.env.COMPATIBILITY_MATCHING_ENABLED = 'true'
    process.env.FRIENDSHIP_MATCHING_ENABLED = 'false'
    expect(isCompatibilityFeatureEnabled()).toBe(true)
    expect(isFriendshipMatchingEnabled()).toBe(false)
  })

  it('allows questionnaire save/submit when matching is disabled', () => {
    const access = evaluateFriendshipAccess({
      signedIn: true,
      approved: true,
      friendsIntent: true,
      entitlementInput: paidEntitlement,
      questionnaire: submittedFriendshipRow(),
    })
    expect(access.canMutate).toBe(true)
    expect(access.canViewForm).toBe(true)
    expect(access.status).toBe('matching_unavailable')
    expect(access.ctaHref).toBe('/matches/friends')
    expect(
      assertCanMutateFriendshipQuestionnaire({
        signedIn: true,
        approved: true,
        friendsIntent: true,
        entitlementInput: paidEntitlement,
        questionnaire: submittedFriendshipRow(),
      }).ok
    ).toBe(true)
    expect(
      assertCanScoreFriendshipQuestionnaire({
        signedIn: true,
        approved: true,
        friendsIntent: true,
        entitlementInput: paidEntitlement,
        questionnaire: submittedFriendshipRow(),
      }).ok
    ).toBe(false)
  })

  it('does not generate or refresh match rows when disabled', async () => {
    const client = throwingClient()
    await expect(
      refreshFriendshipRecommendationsForUser(client, 'user-1')
    ).resolves.toEqual({
      userId: 'user-1',
      outcome: 'skipped',
      created: 0,
      batchId: null,
      skipReason: 'Friendship matching is disabled.',
    })
    await expect(
      refreshFriendshipRecommendationsForAllEligible(client)
    ).resolves.toEqual({
      processed: 0,
      delivered: 0,
      empty: 0,
      skipped: 0,
      created: 0,
    })
    await expect(rescoreFriendshipRecommendationsInvolving(client, 'user-1')).resolves.toBe(
      0
    )
    await expect(loadFriendshipMatchPool(client)).resolves.toEqual({
      profiles: [],
      error: null,
    })
    await expect(
      loadFriendshipMatchRecommendations(client, 'user-1')
    ).resolves.toEqual({ items: [], error: null })
  })

  it('does not refresh Friendship matches from cron when disabled', () => {
    expect(friendshipCronShouldRefresh()).toEqual({
      refresh: false,
      reason: 'Friendship matching is disabled.',
    })
    process.env.FRIENDSHIP_MATCHING_ENABLED = 'true'
    expect(friendshipCronShouldRefresh()).toEqual({
      refresh: true,
      reason: null,
    })
  })

  it('does not expose match results on the matches page when disabled', () => {
    expect(resolveFriendshipMatchesView({ canViewMatches: false })).toEqual({
      kind: 'redirect',
      href: '/friendship',
      loadRecommendations: false,
    })
    const view = resolveFriendshipMatchesView({ canViewMatches: true })
    expect(view).toEqual({
      kind: 'unavailable',
      title: FRIENDSHIP_MATCHING_UNAVAILABLE_HEADING,
      description: FRIENDSHIP_MATCHING_UNAVAILABLE_BODY,
      loadRecommendations: false,
    })
    expect(JSON.stringify(view)).not.toMatch(/score|alcohol|priority|billing|%/)
    process.env.FRIENDSHIP_MATCHING_ENABLED = 'true'
    expect(
      resolveFriendshipMatchesView({ canViewMatches: true }).loadRecommendations
    ).toBe(true)
  })

  it('keeps Dating matching independent when Friendship matching is off', () => {
    process.env.COMPATIBILITY_MATCHING_ENABLED = 'true'
    expect(isCompatibilityFeatureEnabled()).toBe(true)
    expect(canGenerateFriendshipMatches(
      {
        application_status: 'approved',
        connection_intents: ['friends'],
        membership_billing: innerCircleBilling,
      },
      paidEntitlement,
      submittedFriendshipRow()
    )).toBe(false)
  })
})

describe('friendship recommendation pool eligibility', () => {
  afterEach(() => {
    delete process.env.FRIENDSHIP_MATCHING_ENABLED
  })

  it('requires matching enabled, approved, paid, Friends intent, and a submitted questionnaire', () => {
    expect(isFriendshipMatchPoolCandidate(poolProfile)).toBe(false)

    process.env.FRIENDSHIP_MATCHING_ENABLED = 'true'
    expect(isFriendshipMatchPoolCandidate(poolProfile)).toBe(true)
    expect(
      isFriendshipMatchPoolCandidate({
        ...poolProfile,
        application_status: 'submitted',
      })
    ).toBe(false)
    expect(
      isFriendshipMatchPoolCandidate({
        ...poolProfile,
        connection_intents: ['dating'],
      })
    ).toBe(false)
    expect(
      isFriendshipMatchPoolCandidate({
        ...poolProfile,
        membership_billing: freeMemberBilling,
      })
    ).toBe(false)
    expect(
      isFriendshipMatchPoolCandidate({
        ...poolProfile,
        questionnaire: { ...submittedFriendshipRow(), status: 'draft', completed_at: null },
      })
    ).toBe(false)
  })
})
