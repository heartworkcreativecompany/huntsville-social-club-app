import { afterEach, describe, expect, it } from 'vitest'
import {
  FRIENDSHIP_PAID_LOCK_BODY,
  FRIENDSHIP_PAID_LOCK_CTA,
  FRIENDSHIP_PAID_LOCK_HEADING,
  FRIENDSHIP_UPGRADE_HREF,
  assertCanMutateFriendshipQuestionnaire,
  canGenerateFriendshipMatches,
  evaluateFriendshipAccess,
  isFriendshipEligible,
} from '@/lib/friendship/eligibility'
import {
  completeFriendshipQuestionnaire,
  freeMemberBilling,
  innerCircleBilling,
  submittedFriendshipRow,
} from '@/lib/friendship/test-fixtures'
import { isCompatibilityEligible } from '@/lib/compatibility/eligibility'

const paidEntitlement = { billing: innerCircleBilling, applicationApproved: true }
const freeEntitlement = { billing: freeMemberBilling, applicationApproved: true }

describe('friendship questionnaire access', () => {
  afterEach(() => {
    delete process.env.FRIENDSHIP_MATCHING_ENABLED
    delete process.env.COMPATIBILITY_MATCHING_ENABLED
  })
  it('hides the section from Dating-only members', () => {
    const access = evaluateFriendshipAccess({
      signedIn: true,
      approved: true,
      friendsIntent: false,
      entitlementInput: paidEntitlement,
      questionnaire: null,
    })
    expect(access.canViewSection).toBe(false)
    expect(access.canViewForm).toBe(false)
    expect(access.status).toBe('no_friends')
  })

  it('shows the paid lock for eligible Friends-intent Free Members', () => {
    const access = evaluateFriendshipAccess({
      signedIn: true,
      approved: true,
      friendsIntent: true,
      entitlementInput: freeEntitlement,
      questionnaire: null,
    })
    expect(access.status).toBe('no_messaging')
    expect(access.canViewSection).toBe(true)
    expect(access.canViewForm).toBe(false)
    expect(access.headline).toBe(FRIENDSHIP_PAID_LOCK_HEADING)
    expect(access.detail).toBe(FRIENDSHIP_PAID_LOCK_BODY)
    expect(access.ctaLabel).toBe(FRIENDSHIP_PAID_LOCK_CTA)
    expect(access.ctaHref).toBe(FRIENDSHIP_UPGRADE_HREF)
  })

  it('denies save, submit, and score mutations for Free members', () => {
    const mutation = assertCanMutateFriendshipQuestionnaire({
      signedIn: true,
      approved: true,
      friendsIntent: true,
      entitlementInput: freeEntitlement,
      questionnaire: null,
    })
    expect(mutation.ok).toBe(false)
    if (!mutation.ok) {
      expect(mutation.error).toMatch(/paid membership/i)
    }

    expect(
      canGenerateFriendshipMatches(
        {
          application_status: 'approved',
          connection_intents: ['friends'],
          membership_billing: freeMemberBilling,
        },
        freeEntitlement,
        submittedFriendshipRow()
      )
    ).toBe(false)
  })

  it('allows paid approved Friends-intent members to view and save', () => {
    const access = evaluateFriendshipAccess({
      signedIn: true,
      approved: true,
      friendsIntent: true,
      entitlementInput: paidEntitlement,
      questionnaire: null,
    })
    expect(access.canViewForm).toBe(true)
    expect(access.canMutate).toBe(true)
    expect(access.status).toBe('questionnaire_needed')
    expect(
      assertCanMutateFriendshipQuestionnaire({
        signedIn: true,
        approved: true,
        friendsIntent: true,
        entitlementInput: paidEntitlement,
        questionnaire: null,
      }).ok
    ).toBe(true)
  })

  it('does not treat Friends-only members as Dating compatibility eligible', () => {
    process.env.COMPATIBILITY_MATCHING_ENABLED = 'true'
    expect(
      isCompatibilityEligible(
        {
          application_status: 'approved',
          connection_intents: ['friends'],
          connections_open_to: null,
          compatibility_completed_at: '2026-01-01T00:00:00.000Z',
          compatibility_questionnaire: completeFriendshipQuestionnaire(),
          wants_curated_matches: true,
          curated_matches_paused_at: null,
          curated_matches_pause_reason: null,
          dating_connection_enabled_at: null,
          dating_connection_removed_at: null,
          messaging_entitlement_lost_at: null,
          messaging_entitlement_restored_at: null,
        },
        paidEntitlement
      )
    ).toBe(false)
    delete process.env.COMPATIBILITY_MATCHING_ENABLED
  })

  it('requires paid + approved + Friends + submitted questionnaire for match generation', () => {
    process.env.FRIENDSHIP_MATCHING_ENABLED = 'true'
    const profile = {
      application_status: 'approved',
      connection_intents: ['friends'],
      membership_billing: innerCircleBilling,
    }
    expect(isFriendshipEligible(profile, paidEntitlement)).toBe(true)
    expect(canGenerateFriendshipMatches(profile, paidEntitlement, null)).toBe(false)
    expect(
      canGenerateFriendshipMatches(profile, paidEntitlement, submittedFriendshipRow())
    ).toBe(true)
    expect(
      canGenerateFriendshipMatches(
        { ...profile, connection_intents: ['dating'] },
        paidEntitlement,
        submittedFriendshipRow()
      )
    ).toBe(false)
  })
})
