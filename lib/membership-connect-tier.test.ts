import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  canGenerateMatches,
  hasCuratedMatchingEntitlement,
  hasMessagingEntitlement,
  isCompatibilityEligible,
} from '@/lib/compatibility/eligibility'
import { summarizeCompatibilityProfileStatus } from '@/lib/compatibility/profile-status'
import { canAccessMatchesInbox } from '@/lib/compatibility/matches-access'
import { canShowDatingMatchesNav } from '@/lib/compatibility/viewer-context'
import {
  evaluateFriendshipAccess,
  canGenerateFriendshipMatches,
} from '@/lib/friendship/eligibility'
import { isFriendshipMatchPoolCandidate } from '@/lib/friendship/candidate-pool'
import { canShowFriendsMatchesNav } from '@/lib/friendship/viewer-context'
import {
  connectBilling,
  freeMemberBilling,
  innerCircleBilling,
  submittedFriendshipRow,
} from '@/lib/friendship/test-fixtures'
import {
  buildMemberEntitlements,
  canStartMessageRequest,
  evaluateEventRegistration,
  isUnexpiredCircleEntitlementCycle,
  type EntitlementCycle,
} from '@/lib/membership-entitlements'
import { parseMembershipBilling } from '@/lib/membership-systems'
import {
  effectivePublicTier,
  paidPublicTierFromMembershipTier,
  visiblePublicMemberBadges,
} from '@/lib/public-member-badges'
import { STRIPE_LIVE_PRICE_IDS, isPaidMembershipTier } from '@/lib/stripe/config'
import { CONNECT_MATCHES_TEASER } from '@/components/dashboard/connect-matches-teaser'
import { COMPATIBILITY_QUESTIONNAIRE_VERSION } from '@/lib/compatibility/questionnaire-config'

const repoRoot = join(__dirname, '..')

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

const eliteBilling = {
  ...innerCircleBilling,
  tier: 'elite_circle' as const,
}

function circleCycle(
  tier: 'inner_circle' | 'elite_circle',
  periodEnd = new Date(Date.now() + 86_400_000).toISOString()
): EntitlementCycle {
  return {
    id: 'cycle-1',
    product_tier: tier,
    period_start: new Date(Date.now() - 86_400_000).toISOString(),
    period_end: periodEnd,
    credits_granted: tier === 'inner_circle' ? 1 : 2,
    credits_used: 0,
    guest_invites_granted: tier === 'elite_circle' ? 1 : 0,
    guest_invites_used: 0,
    circle_social_credits_granted: tier === 'inner_circle' ? 2 : null,
    circle_social_credits_used: 0,
    is_active: true,
  }
}

function entitlementsFor(
  tier: 'member' | 'connect' | 'inner_circle' | 'elite_circle',
  cycle?: EntitlementCycle | null
) {
  return buildMemberEntitlements({
    applicationApproved: true,
    billing:
      tier === 'member'
        ? freeMemberBilling
        : {
            ...(tier === 'connect'
              ? connectBilling
              : tier === 'elite_circle'
                ? eliteBilling
                : innerCircleBilling),
            subscription_status: 'active',
          },
    activeCycle: cycle === undefined ? (tier === 'member' || tier === 'connect' ? null : circleCycle(tier === 'elite_circle' ? 'elite_circle' : 'inner_circle')) : cycle,
  })
}

describe('Connect membership tier', () => {
  afterEach(() => {
    delete process.env.COMPATIBILITY_MATCHING_ENABLED
    delete process.env.FRIENDSHIP_MATCHING_ENABLED
  })

  it('parses connect billing JSON and maps the live Stripe price', () => {
    expect(parseMembershipBilling({ tier: 'connect' }).tier).toBe('connect')
    expect(isPaidMembershipTier('connect')).toBe(true)
    expect(STRIPE_LIVE_PRICE_IDS.connect).toBe('price_1UCjKABei7W40myB2Mnqrtse')
  })

  it('1. Member cannot message or use curated matching', () => {
    const entitlements = entitlementsFor('member')
    expect(entitlements.canMessage).toBe(false)
    expect(entitlements.canUseCuratedMatching).toBe(false)
    expect(hasMessagingEntitlement({ billing: freeMemberBilling })).toBe(false)
    expect(hasCuratedMatchingEntitlement({ billing: freeMemberBilling })).toBe(false)
  })

  it('2. Connect can message but cannot use questionnaires, pools, inboxes, or intros', () => {
    process.env.COMPATIBILITY_MATCHING_ENABLED = 'true'
    process.env.FRIENDSHIP_MATCHING_ENABLED = 'true'
    const entitlements = entitlementsFor('connect')
    expect(entitlements.canMessage).toBe(true)
    expect(entitlements.canUseCuratedMatching).toBe(false)
    expect(entitlements.canCreateStandardEvents).toBe(false)
    expect(entitlements.canApplyBusinessListing).toBe(false)
    expect(entitlements.hasPriorityRsvp).toBe(false)
    expect(entitlements.premiumCreditsRemaining).toBeNull()
    expect(entitlements.circleSocialCreditsRemaining).toBeNull()
    expect(entitlements.guestInvitesRemaining).toBe(0)

    const datingProfile = {
      application_status: 'approved',
      connection_intents: ['dating'],
      compatibility_completed_at: '2026-01-01T00:00:00.000Z',
      compatibility_questionnaire: completeQuestionnaire,
      wants_curated_matches: true,
      curated_matches_paused_at: null,
      curated_matches_pause_reason: null,
      connections_open_to: ['Dating'],
      dating_connection_enabled_at: null,
      dating_connection_removed_at: null,
      messaging_entitlement_lost_at: null,
      messaging_entitlement_restored_at: null,
      membership_billing: connectBilling,
      role: 'member',
    }

    expect(isCompatibilityEligible(datingProfile, { billing: connectBilling })).toBe(
      false
    )
    expect(canGenerateMatches(datingProfile, { billing: connectBilling })).toBe(false)
    expect(
      summarizeCompatibilityProfileStatus({
        profile: datingProfile,
        entitlementInput: { billing: connectBilling, applicationApproved: true },
      }).status
    ).toBe('no_curated_matching')
    expect(
      canAccessMatchesInbox(
        summarizeCompatibilityProfileStatus({
          profile: datingProfile,
          entitlementInput: { billing: connectBilling, applicationApproved: true },
        })
      )
    ).toBe(false)

    const friendshipAccess = evaluateFriendshipAccess({
      signedIn: true,
      approved: true,
      friendsIntent: true,
      entitlementInput: { billing: connectBilling, applicationApproved: true },
      questionnaire: submittedFriendshipRow(),
    })
    expect(friendshipAccess.status).toBe('no_curated_matching')
    expect(friendshipAccess.canMutate).toBe(false)
    expect(friendshipAccess.canViewForm).toBe(false)
    expect(friendshipAccess.canViewMatches).toBe(false)
    expect(
      canGenerateFriendshipMatches(
        { application_status: 'approved', connection_intents: ['friends'] },
        { billing: connectBilling, applicationApproved: true },
        submittedFriendshipRow()
      )
    ).toBe(false)
    expect(
      isFriendshipMatchPoolCandidate({
        application_status: 'approved',
        connection_intents: ['friends'],
        role: 'member',
        membership_billing: connectBilling,
        questionnaire: submittedFriendshipRow(),
      })
    ).toBe(false)
  })

  it('3. Inner Circle keeps matching, event creation, and Inner credits without Elite extras', () => {
    const entitlements = entitlementsFor('inner_circle')
    expect(entitlements.canMessage).toBe(true)
    expect(entitlements.canUseCuratedMatching).toBe(true)
    expect(entitlements.canCreateStandardEvents).toBe(true)
    expect(entitlements.premiumCreditsRemaining).toBe(1)
    expect(entitlements.circleSocialCreditsRemaining).toBe(2)
    expect(entitlements.canApplyBusinessListing).toBe(false)
    expect(entitlements.hasPriorityRsvp).toBe(false)
    expect(entitlements.guestInvitesRemaining).toBe(0)
  })

  it('4. Elite Circle retains matching, 2 premium credits, unlimited Circle Socials, priority, guest, and listing', () => {
    const entitlements = entitlementsFor('elite_circle')
    expect(entitlements.canUseCuratedMatching).toBe(true)
    expect(entitlements.premiumCreditsRemaining).toBe(2)
    expect(entitlements.circleSocialCreditsRemaining).toBeNull()
    expect(entitlements.hasPriorityRsvp).toBe(true)
    expect(entitlements.guestInvitesRemaining).toBe(1)
    expect(entitlements.canApplyBusinessListing).toBe(true)
    const social = evaluateEventRegistration({
      entitlements,
      eventType: 'circle_social',
      eventStatus: 'published',
      isGoingRsvp: true,
    })
    expect(social.allowed).toBe(true)
    if (social.allowed) {
      expect(social.method).toBe('included_unlimited')
    }
  })

  it('5. Connect does not receive or consume credit-cycle benefits, including leftover Inner cycles', () => {
    const leftover = circleCycle('inner_circle')
    const entitlements = entitlementsFor('connect', leftover)
    expect(entitlements.premiumCreditsRemaining).toBeNull()
    expect(entitlements.circleSocialCreditsRemaining).toBeNull()
    expect(entitlements.activeCycle).toBeNull()
    expect(entitlements.matchingCycle?.product_tier).toBe('inner_circle')
    expect(entitlements.guestInvitesRemaining).toBe(0)
    const social = evaluateEventRegistration({
      entitlements,
      eventType: 'circle_social',
      eventStatus: 'published',
      isGoingRsvp: true,
    })
    expect(social.allowed).toBe(true)
    if (social.allowed) {
      expect(social.method).toBe('paid_per_event')
    }
    const syncSource = readFileSync(
      join(repoRoot, 'lib/stripe/sync-subscription.ts'),
      'utf8'
    )
    expect(syncSource).toContain('isCircleProductTier(mappedTier)')
  })

  it('6. Direct messaging permits Connect ↔ Inner/Elite and blocks Member ↔ Connect', () => {
    const member = entitlementsFor('member')
    const connect = entitlementsFor('connect')
    const inner = entitlementsFor('inner_circle')
    const elite = entitlementsFor('elite_circle')
    expect(
      canStartMessageRequest({
        senderEntitlements: connect,
        recipientEntitlements: inner,
        senderId: 'a',
        recipientId: 'b',
      })
    ).toBe(true)
    expect(
      canStartMessageRequest({
        senderEntitlements: connect,
        recipientEntitlements: elite,
        senderId: 'a',
        recipientId: 'b',
      })
    ).toBe(true)
    expect(
      canStartMessageRequest({
        senderEntitlements: member,
        recipientEntitlements: connect,
        senderId: 'a',
        recipientId: 'b',
      })
    ).toBe(false)
  })

  it('7. Matching eligibility and pools exclude Connect even with approved live profile, intent, questionnaire, and active subscription', () => {
    process.env.COMPATIBILITY_MATCHING_ENABLED = 'true'
    process.env.FRIENDSHIP_MATCHING_ENABLED = 'true'
    expect(
      hasCuratedMatchingEntitlement({
        billing: connectBilling,
        applicationApproved: true,
      })
    ).toBe(false)
    expect(
      canShowDatingMatchesNav({
        canAccessApp: true,
        profile: {
          application_status: 'approved',
          connection_intents: ['dating'],
          membership_billing: connectBilling,
        },
      } as never)
    ).toBe(false)
    expect(
      canShowFriendsMatchesNav({
        canAccessApp: true,
        profile: {
          application_status: 'approved',
          connection_intents: ['friends'],
          membership_billing: connectBilling,
        },
      } as never)
    ).toBe(false)
  })

  it('8. Circle → Connect holdover keeps matching until the Inner/Elite cycle ends, then drops matching only', () => {
    process.env.COMPATIBILITY_MATCHING_ENABLED = 'true'
    process.env.FRIENDSHIP_MATCHING_ENABLED = 'true'
    const futureCycle = circleCycle('inner_circle')
    const pending = buildMemberEntitlements({
      applicationApproved: true,
      billing: connectBilling,
      activeCycle: futureCycle,
    })
    expect(pending.canMessage).toBe(true)
    expect(pending.canUseCuratedMatching).toBe(true)
    expect(pending.matchingCycle?.id).toBe(futureCycle.id)
    expect(pending.activeCycle).toBeNull()
    expect(pending.premiumCreditsRemaining).toBeNull()
    expect(isUnexpiredCircleEntitlementCycle(futureCycle)).toBe(true)

    const expiredCycle = circleCycle(
      'inner_circle',
      new Date(Date.now() - 60_000).toISOString()
    )
    const effective = buildMemberEntitlements({
      applicationApproved: true,
      billing: connectBilling,
      activeCycle: expiredCycle,
      now: new Date(),
    })
    expect(effective.canMessage).toBe(true)
    expect(effective.canUseCuratedMatching).toBe(false)
    expect(
      canGenerateMatches(
        {
          application_status: 'approved',
          connection_intents: ['dating'],
          compatibility_completed_at: '2026-01-01T00:00:00.000Z',
          compatibility_questionnaire: completeQuestionnaire,
          wants_curated_matches: true,
          curated_matches_paused_at: null,
          curated_matches_pause_reason: null,
          connections_open_to: ['Dating'],
          dating_connection_enabled_at: null,
          dating_connection_removed_at: null,
          messaging_entitlement_lost_at: null,
          messaging_entitlement_restored_at: null,
          membership_billing: connectBilling,
          role: 'member',
        },
        { billing: connectBilling, applicationApproved: true, activeCycle: expiredCycle }
      )
    ).toBe(false)
    expect(
      isFriendshipMatchPoolCandidate({
        application_status: 'approved',
        connection_intents: ['friends'],
        role: 'member',
        membership_billing: connectBilling,
        questionnaire: submittedFriendshipRow(),
        activeCycle: expiredCycle,
      })
    ).toBe(false)

    const hook = readFileSync(
      join(repoRoot, 'lib/compatibility/subscription-sync-hook.ts'),
      'utf8'
    )
    expect(hook).toContain('userHadCuratedMatchingBeforeBillingChange')
    expect(hook).toContain('expirePendingFriendshipRecommendations')
    expect(hook).toContain('onMessagingEntitlementLost')
  })

  it('9. Connect dashboard teaser uses the approved copy and hides locked match experiences', () => {
    expect(CONNECT_MATCHES_TEASER).toEqual({
      heading: 'Find your people with curated matches',
      body: 'Inner Circle members can complete Dating and Friendship Compatibility Questionnaires and receive curated recommendations based on shared values, interests, lifestyle, social style, and connection goals.',
      ctaLabel: 'Upgrade to Inner Circle',
      href: '/upgrade',
    })
    const dashboard = readFileSync(
      join(repoRoot, 'app/(club)/dashboard/page.tsx'),
      'utf8'
    )
    expect(dashboard).toContain('ConnectMatchesTeaser')
    expect(dashboard).toContain('shouldHideCuratedMatchingSurfaces')
    expect(dashboard).not.toContain('dating_upgrade')
    const compatibilityPage = readFileSync(
      join(repoRoot, 'app/(club)/compatibility/page.tsx'),
      'utf8'
    )
    expect(compatibilityPage).toContain("redirect('/dashboard')")
    const friendshipPage = readFileSync(
      join(repoRoot, 'app/(club)/friendship/page.tsx'),
      'utf8'
    )
    expect(friendshipPage).toContain("redirect('/dashboard')")
  })

  it('10. Badges resolve Member, Connect, Inner Circle, Elite Circle, including staff/complimentary rules', () => {
    expect(paidPublicTierFromMembershipTier('connect')).toBe('connect')
    expect(
      visiblePublicMemberBadges({ role: 'member', membership_tier: 'connect' }).map(
        (badge) => badge.label
      )
    ).toEqual(['Connect'])
    expect(
      visiblePublicMemberBadges({
        role: 'member',
        membership_tier: 'inner_circle',
      }).map((badge) => badge.label)
    ).toEqual(['Inner Circle'])
    expect(
      visiblePublicMemberBadges({
        role: 'member',
        membership_tier: 'elite_circle',
      }).map((badge) => badge.label)
    ).toEqual(['Elite Circle'])
    expect(
      visiblePublicMemberBadges({ role: 'member', membership_tier: 'member' }).map(
        (badge) => badge.label
      )
    ).toEqual(['Member'])
    expect(
      effectivePublicTier({
        role: 'admin',
        billing: connectBilling,
      })
    ).toBeNull()
    expect(
      buildMemberEntitlements({
        role: 'admin',
        applicationApproved: true,
        billing: connectBilling,
      }).canUseCuratedMatching
    ).toBe(true)
    expect(
      buildMemberEntitlements({
        role: 'member',
        applicationApproved: true,
        billing: freeMemberBilling,
        accessOverride: {
          tier: 'elite_circle',
          startsAt: '2026-01-01T00:00:00.000Z',
          expiresAt: null,
        },
      }).canUseCuratedMatching
    ).toBe(true)
  })

  it('preserves past_due as a drop to Member with no Connect exception', () => {
    const entitlements = buildMemberEntitlements({
      applicationApproved: true,
      billing: { ...connectBilling, subscription_status: 'past_due' },
    })
    expect(entitlements.productTier).toBe('member')
    expect(entitlements.canMessage).toBe(false)
    expect(entitlements.canUseCuratedMatching).toBe(false)
  })

  it('lets Connect pay for Circle Socials and Premium Events and attend Standard Events free', () => {
    const entitlements = entitlementsFor('connect')
    const standard = evaluateEventRegistration({
      entitlements,
      eventType: 'standard_event',
      eventStatus: 'published',
      isGoingRsvp: true,
    })
    expect(standard.allowed).toBe(true)
    const premium = evaluateEventRegistration({
      entitlements,
      eventType: 'premium_event',
      eventStatus: 'published',
      isGoingRsvp: true,
    })
    expect(premium.allowed).toBe(true)
    if (premium.allowed) {
      expect(premium.method).toBe('paid_per_event')
    }
  })
})
