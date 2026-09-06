import { describe, expect, it } from 'vitest'
import {
  buildDashboardActionNeeded,
  DASHBOARD_ACTION_NEEDED_COPY,
} from '@/lib/dashboard/action-needed'
import type { CompatibilityProfileStatus } from '@/lib/compatibility/profile-status'
import type { FriendshipAccessStatus } from '@/lib/friendship/types'

const allDatingStatuses: CompatibilityProfileStatus[] = [
  'disabled',
  'not_approved',
      'no_dating',
      'no_messaging',
      'no_curated_matching',
      'paused',
  'paused_system',
  'questionnaire_needed',
  'questionnaire_in_progress',
  'active',
]

const allFriendStatuses: FriendshipAccessStatus[] = [
  'not_signed_in',
  'not_approved',
      'no_friends',
      'no_messaging',
      'no_curated_matching',
      'questionnaire_needed',
  'questionnaire_in_progress',
  'matching_unavailable',
  'active',
]

describe('buildDashboardActionNeeded', () => {
  it('uses the approved titles, descriptions, CTAs, and hrefs', () => {
    const cards = buildDashboardActionNeeded({
      datingStatus: 'questionnaire_needed',
      friendshipStatus: 'questionnaire_needed',
      profileCompletionPercent: 50,
      datingMatchingEnabled: true,
      friendshipMatchingEnabled: true,
    })

    expect(cards.map((card) => card.kind)).toEqual([
      'dating_questionnaire',
      'friend_questionnaire',
      'profile_completion',
    ])
    expect(cards[0]).toMatchObject(DASHBOARD_ACTION_NEEDED_COPY.dating_questionnaire)
    expect(cards[1]).toMatchObject(DASHBOARD_ACTION_NEEDED_COPY.friend_questionnaire)
    expect(cards[2]).toMatchObject(DASHBOARD_ACTION_NEEDED_COPY.profile_completion)
  })

  it('never shows a matching questionnaire prompt to an unpaid member', () => {
    const cards = buildDashboardActionNeeded({
      datingStatus: 'no_messaging',
      friendshipStatus: 'no_messaging',
      profileCompletionPercent: 100,
      datingMatchingEnabled: true,
      friendshipMatchingEnabled: true,
    })

    expect(cards.map((card) => card.kind)).toEqual([
      'dating_upgrade',
      'friends_upgrade',
    ])
    expect(cards.some((card) => card.kind.includes('questionnaire'))).toBe(false)
    expect(cards[0]).toMatchObject(DASHBOARD_ACTION_NEEDED_COPY.dating_upgrade)
    expect(cards[1]).toMatchObject(DASHBOARD_ACTION_NEEDED_COPY.friends_upgrade)
  })

  it('hides upgrade and questionnaire cards when matching flags are off', () => {
    const cards = buildDashboardActionNeeded({
      datingStatus: 'no_messaging',
      friendshipStatus: 'no_messaging',
      profileCompletionPercent: 100,
      datingMatchingEnabled: false,
      friendshipMatchingEnabled: false,
    })
    expect(cards).toEqual([])

    const incomplete = buildDashboardActionNeeded({
      datingStatus: 'questionnaire_needed',
      friendshipStatus: 'questionnaire_in_progress',
      profileCompletionPercent: 100,
      datingMatchingEnabled: false,
      friendshipMatchingEnabled: false,
    })
    expect(incomplete).toEqual([])
  })

  it('does not prompt dating questionnaire or upgrade while dating is paused', () => {
    for (const datingStatus of ['paused', 'paused_system'] as const) {
      const cards = buildDashboardActionNeeded({
        datingStatus,
        friendshipStatus: 'active',
        profileCompletionPercent: 100,
        datingMatchingEnabled: true,
        friendshipMatchingEnabled: true,
      })
      expect(cards.map((card) => card.kind)).toEqual([])
    }
  })

  it('omits friendship questionnaire and upgrade when matching is unavailable', () => {
    const cards = buildDashboardActionNeeded({
      datingStatus: 'active',
      friendshipStatus: 'matching_unavailable',
      profileCompletionPercent: 100,
      datingMatchingEnabled: true,
      friendshipMatchingEnabled: true,
    })
    expect(cards).toEqual([])
  })

  it('keeps questionnaire, upgrade, then profile in that priority', () => {
    const cards = buildDashboardActionNeeded({
      datingStatus: 'questionnaire_in_progress',
      friendshipStatus: 'no_messaging',
      profileCompletionPercent: 80,
      datingMatchingEnabled: true,
      friendshipMatchingEnabled: true,
    })
    expect(cards.map((card) => card.kind)).toEqual([
      'dating_questionnaire',
      'friends_upgrade',
      'profile_completion',
    ])
  })

  it('omits profile completion when the checklist is complete', () => {
    const cards = buildDashboardActionNeeded({
      datingStatus: 'active',
      friendshipStatus: 'active',
      profileCompletionPercent: 100,
      datingMatchingEnabled: true,
      friendshipMatchingEnabled: true,
    })
    expect(cards).toEqual([])
  })

  it('does not emit dating questionnaire except for incomplete paid dating statuses', () => {
    for (const datingStatus of allDatingStatuses) {
      const cards = buildDashboardActionNeeded({
        datingStatus,
        friendshipStatus: 'active',
        profileCompletionPercent: 100,
        datingMatchingEnabled: true,
        friendshipMatchingEnabled: true,
      })
      const hasQ = cards.some((card) => card.kind === 'dating_questionnaire')
      const hasUpgrade = cards.some((card) => card.kind === 'dating_upgrade')
      if (
        datingStatus === 'questionnaire_needed' ||
        datingStatus === 'questionnaire_in_progress'
      ) {
        expect(hasQ).toBe(true)
        expect(hasUpgrade).toBe(false)
      } else if (datingStatus === 'no_messaging') {
        expect(hasQ).toBe(false)
        expect(hasUpgrade).toBe(true)
      } else {
        expect(hasQ).toBe(false)
        expect(hasUpgrade).toBe(false)
      }
    }
  })

  it('does not emit friend questionnaire except for incomplete paid friendship statuses', () => {
    for (const friendshipStatus of allFriendStatuses) {
      const cards = buildDashboardActionNeeded({
        datingStatus: 'active',
        friendshipStatus,
        profileCompletionPercent: 100,
        datingMatchingEnabled: true,
        friendshipMatchingEnabled: true,
      })
      const hasQ = cards.some((card) => card.kind === 'friend_questionnaire')
      const hasUpgrade = cards.some((card) => card.kind === 'friends_upgrade')
      if (
        friendshipStatus === 'questionnaire_needed' ||
        friendshipStatus === 'questionnaire_in_progress'
      ) {
        expect(hasQ).toBe(true)
        expect(hasUpgrade).toBe(false)
      } else if (friendshipStatus === 'no_messaging') {
        expect(hasQ).toBe(false)
        expect(hasUpgrade).toBe(true)
      } else {
        expect(hasQ).toBe(false)
        expect(hasUpgrade).toBe(false)
      }
    }
  })
})
