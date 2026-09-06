import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { canAccessMatchesInbox } from '@/lib/compatibility/matches-access'
import { canShowDatingMatchesNav } from '@/lib/compatibility/viewer-context'
import { compatibilityContextForViewer } from '@/lib/compatibility/viewer-context'
import {
  FRIENDSHIP_UPGRADE_HREF,
  evaluateFriendshipAccess,
} from '@/lib/friendship/eligibility'
import { resolveFriendshipMatchesView } from '@/lib/friendship/matching-flag'
import {
  connectBilling,
  freeMemberBilling,
  innerCircleBilling,
  submittedFriendshipRow,
} from '@/lib/friendship/test-fixtures'
import { buildMemberEntitlements } from '@/lib/membership-entitlements'
import { canShowFriendsMatchesNav } from '@/lib/friendship/viewer-context'
import { friendshipContextForViewer } from '@/lib/friendship/viewer-context'
import type { Viewer } from '@/lib/viewer'

const repoRoot = join(__dirname, '..')

function source(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), 'utf8')
}

function makeViewer(patch: {
  application_status?: string | null
  connection_intents?: string[] | null
  profile?: null
  canAccessApp?: boolean
  membership_billing?: unknown
  compatibility_completed_at?: string | null
  compatibility_questionnaire?: unknown
  wants_curated_matches?: boolean | null
  curated_matches_paused_at?: string | null
  curated_matches_pause_reason?: string | null
}): Viewer {
  if (patch.profile === null) {
    return {
      canAccessApp: patch.canAccessApp ?? false,
      profile: null,
    } as Viewer
  }

  return {
    canAccessApp: patch.canAccessApp ?? true,
    profile: {
      application_status: patch.application_status ?? 'approved',
      connection_intents: patch.connection_intents ?? ['dating'],
      membership_billing: patch.membership_billing ?? freeMemberBilling,
      compatibility_completed_at: patch.compatibility_completed_at ?? null,
      compatibility_questionnaire: patch.compatibility_questionnaire,
      wants_curated_matches: patch.wants_curated_matches ?? true,
      curated_matches_paused_at: patch.curated_matches_paused_at ?? null,
      curated_matches_pause_reason: patch.curated_matches_pause_reason ?? null,
    },
  } as Viewer
}

describe('intent-based match inbox navigation', () => {
  afterEach(() => {
    delete process.env.COMPATIBILITY_MATCHING_ENABLED
    delete process.env.FRIENDSHIP_MATCHING_ENABLED
  })

  it('hides both tabs for unapproved or missing profiles', () => {
    process.env.COMPATIBILITY_MATCHING_ENABLED = 'true'
    process.env.FRIENDSHIP_MATCHING_ENABLED = 'true'
    const submitted = makeViewer({
      application_status: 'submitted',
      connection_intents: ['dating', 'friends'],
      canAccessApp: false,
    })
    expect(canShowDatingMatchesNav(submitted)).toBe(false)
    expect(canShowFriendsMatchesNav(submitted)).toBe(false)
    expect(canShowDatingMatchesNav(makeViewer({ profile: null }))).toBe(false)
    expect(canShowFriendsMatchesNav(makeViewer({ profile: null }))).toBe(false)
  })

  it('hides tabs when the relevant intent is missing', () => {
    process.env.COMPATIBILITY_MATCHING_ENABLED = 'true'
    process.env.FRIENDSHIP_MATCHING_ENABLED = 'true'
    const networkingOnly = makeViewer({ connection_intents: ['networking'] })
    expect(canShowDatingMatchesNav(networkingOnly)).toBe(false)
    expect(canShowFriendsMatchesNav(networkingOnly)).toBe(false)
  })

  it('hides tabs when the relevant feature flag is off, even if the questionnaire is complete', () => {
    const bothIntents = makeViewer({
      connection_intents: ['dating', 'friends'],
      compatibility_completed_at: '2026-01-01T00:00:00.000Z',
    })
    expect(canShowDatingMatchesNav(bothIntents)).toBe(false)
    expect(canShowFriendsMatchesNav(bothIntents)).toBe(false)
  })

  it('hides dating and friends tabs for unpaid members even with the relevant intent', () => {
    process.env.COMPATIBILITY_MATCHING_ENABLED = 'true'
    process.env.FRIENDSHIP_MATCHING_ENABLED = 'true'
    const unpaidDating = makeViewer({
      connection_intents: ['dating'],
      membership_billing: freeMemberBilling,
    })
    const unpaidFriends = makeViewer({
      connection_intents: ['friends'],
      membership_billing: freeMemberBilling,
    })
    expect(canShowDatingMatchesNav(unpaidDating)).toBe(false)
    expect(canShowFriendsMatchesNav(unpaidFriends)).toBe(false)
    expect(
      canAccessMatchesInbox(
        compatibilityContextForViewer(unpaidDating, null).summary
      )
    ).toBe(false)
    expect(
      resolveFriendshipMatchesView({
        canViewMatches: friendshipContextForViewer(unpaidFriends, null, null)
          .access.canViewMatches,
      }).loadRecommendations
    ).toBe(false)
  })

  it('shows both tabs when both intents are selected, flags are on, and the member has Circle matching', () => {
    process.env.COMPATIBILITY_MATCHING_ENABLED = 'true'
    process.env.FRIENDSHIP_MATCHING_ENABLED = 'true'
    const both = makeViewer({
      connection_intents: ['dating', 'friends'],
      membership_billing: innerCircleBilling,
    })
    expect(canShowDatingMatchesNav(both)).toBe(true)
    expect(canShowFriendsMatchesNav(both)).toBe(true)
  })

  it('does not require questionnaire completion for nav', () => {
    process.env.COMPATIBILITY_MATCHING_ENABLED = 'true'
    process.env.FRIENDSHIP_MATCHING_ENABLED = 'true'
    const incomplete = makeViewer({
      connection_intents: ['dating', 'friends'],
      membership_billing: innerCircleBilling,
      compatibility_completed_at: null,
    })
    expect(canShowDatingMatchesNav(incomplete)).toBe(true)
    expect(canShowFriendsMatchesNav(incomplete)).toBe(true)
  })

  it('hides match tabs for Connect members with dating or friends intent', () => {
    process.env.COMPATIBILITY_MATCHING_ENABLED = 'true'
    process.env.FRIENDSHIP_MATCHING_ENABLED = 'true'
    const connectDating = makeViewer({
      connection_intents: ['dating', 'friends'],
      membership_billing: connectBilling,
    })
    expect(canShowDatingMatchesNav(connectDating)).toBe(false)
    expect(canShowFriendsMatchesNav(connectDating)).toBe(false)
  })
})

describe('canonical page gates versus nav', () => {
  afterEach(() => {
    delete process.env.COMPATIBILITY_MATCHING_ENABLED
    delete process.env.FRIENDSHIP_MATCHING_ENABLED
  })

  it('keeps dating recommendations behind canAccessMatchesInbox for unpaid, incomplete, paused, and complete states', () => {
    process.env.COMPATIBILITY_MATCHING_ENABLED = 'true'
    const unpaid = makeViewer({
      connection_intents: ['dating'],
      membership_billing: freeMemberBilling,
    })
    expect(compatibilityContextForViewer(unpaid, null).summary.status).toBe(
      'no_messaging'
    )
    expect(
      canAccessMatchesInbox(compatibilityContextForViewer(unpaid, null).summary)
    ).toBe(false)

    const incomplete = makeViewer({
      connection_intents: ['dating'],
      membership_billing: innerCircleBilling,
    })
    expect(
      canAccessMatchesInbox(
        compatibilityContextForViewer(incomplete, null).summary
      )
    ).toBe(false)

    const paused = makeViewer({
      connection_intents: ['dating'],
      membership_billing: innerCircleBilling,
      wants_curated_matches: false,
    })
    expect(canShowDatingMatchesNav(paused)).toBe(true)
    const pausedContext = compatibilityContextForViewer(paused, null)
    expect(pausedContext.summary.status).toBe('paused')
    expect(pausedContext.summary.ctaHref).toBe('/compatibility')
    expect(canAccessMatchesInbox(pausedContext.summary)).toBe(false)
  })

  it('keeps friendship recommendations behind loadRecommendations for unpaid, incomplete, unavailable, and complete states', () => {
    process.env.FRIENDSHIP_MATCHING_ENABLED = 'true'
    const unpaid = evaluateFriendshipAccess({
      signedIn: true,
      approved: true,
      friendsIntent: true,
      entitlementInput: { billing: freeMemberBilling, applicationApproved: true },
      questionnaire: null,
    })
    expect(unpaid.status).toBe('no_messaging')
    expect(unpaid.ctaHref).toBe(FRIENDSHIP_UPGRADE_HREF)
    expect(
      resolveFriendshipMatchesView({ canViewMatches: unpaid.canViewMatches })
    ).toEqual({ kind: 'gated', loadRecommendations: false })

    const incomplete = evaluateFriendshipAccess({
      signedIn: true,
      approved: true,
      friendsIntent: true,
      entitlementInput: { billing: innerCircleBilling, applicationApproved: true },
      questionnaire: null,
    })
    expect(incomplete.status).toBe('questionnaire_needed')
    expect(incomplete.ctaHref).toBe('/friendship')
    expect(
      resolveFriendshipMatchesView({ canViewMatches: incomplete.canViewMatches })
        .loadRecommendations
    ).toBe(false)

    const noFriends = evaluateFriendshipAccess({
      signedIn: true,
      approved: true,
      friendsIntent: false,
      entitlementInput: { billing: innerCircleBilling, applicationApproved: true },
      questionnaire: null,
    })
    expect(noFriends.status).toBe('no_friends')
    expect(noFriends.ctaHref).toBe('/profile')
    expect(
      resolveFriendshipMatchesView({ canViewMatches: noFriends.canViewMatches })
        .loadRecommendations
    ).toBe(false)

    const complete = evaluateFriendshipAccess({
      signedIn: true,
      approved: true,
      friendsIntent: true,
      entitlementInput: { billing: innerCircleBilling, applicationApproved: true },
      questionnaire: submittedFriendshipRow(),
    })
    expect(complete.canViewMatches).toBe(true)
    expect(
      resolveFriendshipMatchesView({ canViewMatches: true }).loadRecommendations
    ).toBe(true)
    expect(
      resolveFriendshipMatchesView({ canViewMatches: true }).kind
    ).toBe('inbox')
  })

  it('renders friendship matching unavailable without loading recommendations when the flag is off', () => {
    const complete = evaluateFriendshipAccess({
      signedIn: true,
      approved: true,
      friendsIntent: true,
      entitlementInput: { billing: innerCircleBilling, applicationApproved: true },
      questionnaire: submittedFriendshipRow(),
    })
    expect(complete.status).toBe('matching_unavailable')
    expect(canShowFriendsMatchesNav(makeViewer({ connection_intents: ['friends'] }))).toBe(
      false
    )
    expect(
      resolveFriendshipMatchesView({ canViewMatches: complete.canViewMatches })
        .loadRecommendations
    ).toBe(false)
    expect(
      resolveFriendshipMatchesView({ canViewMatches: false }).kind
    ).toBe('unavailable')
  })

  it('treats complimentary Inner Circle access as matching entitlement for nav and pages', () => {
    process.env.FRIENDSHIP_MATCHING_ENABLED = 'true'
    process.env.COMPATIBILITY_MATCHING_ENABLED = 'true'
    const complimentaryNav = makeViewer({
      connection_intents: ['dating', 'friends'],
      membership_billing: freeMemberBilling,
    })
    expect(canShowDatingMatchesNav(complimentaryNav)).toBe(false)
    expect(canShowFriendsMatchesNav(complimentaryNav)).toBe(false)

    const complimentaryEntitlements = buildMemberEntitlements({
      applicationApproved: true,
      billing: freeMemberBilling,
      accessOverride: {
        tier: 'inner_circle',
        startsAt: '2026-01-01T00:00:00.000Z',
        expiresAt: null,
      },
    })
    expect(canShowDatingMatchesNav(complimentaryNav, complimentaryEntitlements)).toBe(
      true
    )
    expect(canShowFriendsMatchesNav(complimentaryNav, complimentaryEntitlements)).toBe(
      true
    )

    const access = evaluateFriendshipAccess({
      signedIn: true,
      approved: true,
      friendsIntent: true,
      entitlementInput: {
        billing: freeMemberBilling,
        applicationApproved: true,
        accessOverride: {
          tier: 'inner_circle',
          startsAt: '2026-01-01T00:00:00.000Z',
          expiresAt: null,
        },
      },
      questionnaire: submittedFriendshipRow(),
    })
    expect(access.status).toBe('active')
    expect(
      resolveFriendshipMatchesView({ canViewMatches: access.canViewMatches })
        .loadRecommendations
    ).toBe(true)
  })
})

describe('destination pages keep loader guards', () => {
  it('loads dating recommendations only after canAccessMatchesInbox', () => {
    const page = source('app/(club)/matches/dating/page.tsx')
    const loaderIndex = page.indexOf('await loadCuratedMatchRecommendations')
    const gateIndex = page.indexOf('if (!context.canAccessMatchesInbox)')
    expect(gateIndex).toBeGreaterThan(-1)
    expect(loaderIndex).toBeGreaterThan(gateIndex)
    expect(page).toContain('HowCompatibilityWorksInlineSummary')
    expect(page).toContain('shouldHideCuratedMatchingSurfaces')
    expect(page).toContain("redirect('/dashboard')")
  })

  it('loads friendship recommendations only when view.loadRecommendations is true', () => {
    const page = source('app/(club)/matches/friends/page.tsx')
    expect(page).toContain('const shouldLoad = view.loadRecommendations')
    expect(page).toContain('shouldLoad')
    expect(page).toContain('loadFriendshipMatchRecommendations')
    expect(page).toContain("view.kind === 'gated'")
    expect(page).not.toContain('redirect(view.href)')
    expect(page).toContain('shouldHideCuratedMatchingSurfaces')
    expect(page).toContain("redirect('/dashboard')")
  })
})
