import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DASHBOARD_DATING_MATCHES_HREF,
  DASHBOARD_FRIEND_MATCHES_HREF,
  DASHBOARD_MATCH_PREVIEW_LIMIT,
  selectDatingMatchPreviews,
  selectFriendshipMatchPreviews,
} from '@/components/dashboard/recent-matches-preview'
import {
  DASHBOARD_NOTIFICATION_PREVIEW_LIMIT,
  DASHBOARD_NOTIFICATIONS_EMPTY,
  isSafeInAppHref,
} from '@/components/dashboard/recent-notifications'
import { DASHBOARD_EVENTS_EMPTY } from '@/components/dashboard/upcoming-events-preview'
import { DASHBOARD_ACTION_NEEDED_COPY } from '@/lib/dashboard/action-needed'
import type { CuratedMatchListItem } from '@/lib/load-curated-matches'
import type { FriendshipMatchListItem } from '@/lib/friendship/load-matches'

const repoRoot = join(__dirname, '../../..')

function dashboardPageSource() {
  return readFileSync(join(repoRoot, 'app/(club)/dashboard/page.tsx'), 'utf8')
}

function matchesPreviewSource() {
  return readFileSync(
    join(repoRoot, 'components/dashboard/recent-matches-preview.tsx'),
    'utf8'
  )
}

function eventsPreviewSource() {
  return readFileSync(
    join(repoRoot, 'components/dashboard/upcoming-events-preview.tsx'),
    'utf8'
  )
}

function notificationsPreviewSource() {
  return readFileSync(
    join(repoRoot, 'components/dashboard/recent-notifications.tsx'),
    'utf8'
  )
}

function actionNeededSource() {
  return readFileSync(
    join(repoRoot, 'components/dashboard/action-needed.tsx'),
    'utf8'
  )
}

function datingItem(
  patch: Partial<CuratedMatchListItem> & Pick<CuratedMatchListItem, 'id'>
): CuratedMatchListItem {
  return {
    recommendedUserId: `user-${patch.id}`,
    displayName: patch.displayName ?? patch.id,
    locationArea: 'Downtown',
    membershipIntent: 'Loves hiking',
    primaryPhoto: null,
    compatibilityScore: 91,
    matchExplanations: ['Similar relationship intentions'],
    status: 'pending',
    createdAt: '2026-09-01T12:00:00.000Z',
    expiresAt: null,
    introStatus: 'none',
    conversationId: null,
    ...patch,
  }
}

function friendItem(
  patch: Partial<FriendshipMatchListItem> & Pick<FriendshipMatchListItem, 'id'>
): FriendshipMatchListItem {
  return {
    recommendedUserId: `friend-${patch.id}`,
    displayName: patch.displayName ?? patch.id,
    locationArea: 'Downtown',
    primaryPhoto: null,
    fitLabel: 'Strong friendship fit',
    matchReasons: ['Shared weekend energy'],
    createdAt: '2026-09-01T12:00:00.000Z',
    ...patch,
  }
}

describe('approved member dashboard page', () => {
  it('uses the approved Discovery / Dashboard header copy', () => {
    const source = dashboardPageSource()
    expect(source).toContain('eyebrow="Discovery"')
    expect(source).toContain('title="Dashboard"')
    expect(source).toContain(
      'Your latest updates and next steps for curated intros, member discovery, and recent conversations.'
    )
  })

  it('keeps Phase 1 modules and adds Phase 2 sections', () => {
    const source = dashboardPageSource()
    expect(source).toContain('RecentMessagesPreview')
    expect(source).toContain('CuratedIntroCard')
    expect(source).toContain('loadRecentMessagePreviews')
    expect(source).toContain('ActionNeeded')
    expect(source).toContain('RecentNotifications')
    expect(source).toContain('UpcomingEventsPreview')
    expect(source).toContain('RecentMatchesPreview')
    expect(source).not.toContain('MemberDirectorySection')
    expect(source).not.toContain('loadDirectoryProfiles')
  })

  it('requires an approved member and redirects everyone else', () => {
    const source = dashboardPageSource()
    expect(source).toContain("redirect('/login')")
    expect(source).toContain('if (!viewer.canAccessApp)')
    expect(source).toContain("redirect('/application')")
  })

  it('is the approved-member landing destination', () => {
    const home = readFileSync(
      join(repoRoot, 'app/(club)/home/page.tsx'),
      'utf8'
    )
    const application = readFileSync(
      join(repoRoot, 'lib/application.ts'),
      'utf8'
    )

    expect(home).toContain("redirect('/dashboard')")
    expect(home).not.toContain("redirect('/members')")
    expect(application).toContain("href: '/dashboard'")
    expect(application).not.toContain("href: '/home'")
  })

  it('gates recent messages on entitlements.canMessage', () => {
    const source = dashboardPageSource()
    expect(source).toContain('loadMemberEntitlementsForViewer')
    expect(source).toContain('entitlements?.canMessage')
    expect(source).toContain('loadRecentMessagePreviews')
    expect(source).not.toContain('buildMemberEntitlementsWithOverride')
  })

  it('loads dating recommendations only behind canAccessMatchesInbox', () => {
    const source = dashboardPageSource()
    expect(source).toContain('compatibilityContextForViewer')
    expect(source).toContain('canAccessMatchesInbox(datingContext.summary)')
    expect(source).toContain('canLoadDatingRecommendations')
    expect(source).toContain('loadCuratedMatchRecommendations')
    expect(source).not.toContain('healStaleSubscriptionInactivePause')
    expect(source).toMatch(
      /canLoadDatingRecommendations\s*\n\s*\? loadCuratedMatchRecommendations/
    )
  })

  it('loads friendship recommendations only when resolveFriendshipMatchesView allows it', () => {
    const source = dashboardPageSource()
    expect(source).toContain('resolveFriendshipMatchesView')
    expect(source).toContain('friendsView.loadRecommendations')
    expect(source).toContain('canLoadFriendshipRecommendations')
    expect(source).toContain('loadFriendshipMatchRecommendations')
    expect(source).toMatch(
      /canLoadFriendshipRecommendations\s*\n\s*\? loadFriendshipMatchRecommendations/
    )
  })

  it('loads a small notifications preview and upcoming events preview', () => {
    const source = dashboardPageSource()
    expect(source).toContain('loadMemberNotifications')
    expect(source).toContain('DASHBOARD_NOTIFICATION_PREVIEW_LIMIT')
    expect(source).toContain('loadUpcomingEventsPreview')
    expect(DASHBOARD_NOTIFICATION_PREVIEW_LIMIT).toBe(5)
  })
})

describe('dashboard action needed copy', () => {
  it('uses the approved titles, descriptions, CTAs, and hrefs', () => {
    expect(DASHBOARD_ACTION_NEEDED_COPY.dating_questionnaire).toEqual({
      title: 'Complete your Dating Questionnaire',
      description:
        'Share a few more details so we can begin identifying compatible dating connections.',
      ctaLabel: 'Complete questionnaire',
      href: '/compatibility',
    })
    expect(DASHBOARD_ACTION_NEEDED_COPY.friend_questionnaire).toEqual({
      title: 'Complete your Friend Questionnaire',
      description:
        'Share what you are looking for in friendship so we can begin identifying compatible members.',
      ctaLabel: 'Complete questionnaire',
      href: '/friendship',
    })
    expect(DASHBOARD_ACTION_NEEDED_COPY.dating_upgrade).toEqual({
      title: 'Unlock Dating Matches',
      description:
        'Upgrade your membership to access personalized dating matches.',
      ctaLabel: 'View membership options',
      href: '/upgrade',
    })
    expect(DASHBOARD_ACTION_NEEDED_COPY.friends_upgrade).toEqual({
      title: 'Unlock Matched Friends',
      description:
        'Upgrade your membership to access personalized friend matches.',
      ctaLabel: 'View membership options',
      href: '/upgrade',
    })
    expect(DASHBOARD_ACTION_NEEDED_COPY.profile_completion).toEqual({
      title: 'Complete your profile',
      description:
        'Add the remaining details that help other members get to know you.',
      ctaLabel: 'Complete profile',
      href: '/profile',
    })
  })

  it('does not reuse profile-page status modules', () => {
    const source = actionNeededSource()
    expect(source).not.toContain('CompatibilityStatusCard')
    expect(source).not.toContain('FriendshipStatus')
    expect(source).not.toContain('profile-completion-card')
  })
})

describe('dashboard notification href safety', () => {
  it('keeps existing in-app hrefs and rejects unsafe paths', () => {
    expect(isSafeInAppHref('/matches')).toBe(true)
    expect(isSafeInAppHref('/events/abc')).toBe(true)
    expect(isSafeInAppHref('/messages/1')).toBe(true)
    expect(isSafeInAppHref(null)).toBe(false)
    expect(isSafeInAppHref('')).toBe(false)
    expect(isSafeInAppHref('https://example.com')).toBe(false)
    expect(isSafeInAppHref('//evil.example')).toBe(false)
    expect(isSafeInAppHref('javascript:alert(1)')).toBe(false)
  })

  it('uses the approved empty-state copy and does not invent notification types', () => {
    expect(DASHBOARD_NOTIFICATIONS_EMPTY).toEqual({
      title: 'No recent notifications',
      description: 'New updates will appear here as your club activity grows.',
    })
    expect(notificationsPreviewSource()).not.toContain('MEMBER_NOTIFICATION_TYPES')
    expect(notificationsPreviewSource()).not.toContain('MEMBER_NOTIFICATION_TEMPLATES')
  })
})

describe('dashboard upcoming events empty copy', () => {
  it('uses the approved empty-state title, description, CTA, and href', () => {
    expect(DASHBOARD_EVENTS_EMPTY).toEqual({
      title: 'No upcoming events yet',
      description:
        'New experiences are on the way. Check back soon to see what is coming up.',
      ctaLabel: 'View events',
      href: '/events',
    })
  })

  it('does not add RSVP, attendee, credit, or event-management controls', () => {
    const source = eventsPreviewSource()
    expect(source).not.toContain('EventRsvp')
    expect(source).not.toContain('memberGoingLabel')
    expect(source).not.toContain('availabilityLabel')
    expect(source).not.toContain('creatorLabel')
    expect(source).not.toContain('EventForm')
    expect(source).not.toContain('credit')
  })
})

describe('dashboard recent match previews', () => {
  it('keeps at most three active dating recommendations and omits archived ones', () => {
    expect(DASHBOARD_MATCH_PREVIEW_LIMIT).toBe(3)
    const selected = selectDatingMatchPreviews([
      datingItem({
        id: 'archived',
        status: 'passed',
        createdAt: '2026-09-01T18:00:00.000Z',
      }),
      datingItem({
        id: 'one',
        createdAt: '2026-09-01T16:00:00.000Z',
      }),
      datingItem({
        id: 'two',
        createdAt: '2026-09-01T15:00:00.000Z',
      }),
      datingItem({
        id: 'three',
        createdAt: '2026-09-01T14:00:00.000Z',
      }),
      datingItem({
        id: 'four',
        createdAt: '2026-09-01T13:00:00.000Z',
      }),
    ])

    expect(selected.map((item) => item.id)).toEqual(['one', 'two', 'three'])
    expect(selected[0]?.fitSummary).toBe('Similar relationship intentions')
    expect(selected[0]).not.toHaveProperty('compatibilityScore')
  })

  it('omits the dating fit line when no privacy-safe explanation exists', () => {
    const selected = selectDatingMatchPreviews([
      datingItem({ id: 'plain', matchExplanations: [] }),
    ])
    expect(selected).toEqual([
      {
        id: 'plain',
        name: 'plain',
        photo: null,
        memberId: 'user-plain',
        fitSummary: null,
      },
    ])
  })

  it('uses friendship fit labels and caps the friends preview at three', () => {
    const selected = selectFriendshipMatchPreviews([
      friendItem({ id: 'a' }),
      friendItem({ id: 'b' }),
      friendItem({ id: 'c' }),
      friendItem({ id: 'd' }),
    ])
    expect(selected.map((item) => item.id)).toEqual(['a', 'b', 'c'])
    expect(selected[0]?.fitSummary).toBe('Strong friendship fit')
  })

  it('links preview cards only to match inboxes, not member profiles or actions', () => {
    expect(DASHBOARD_DATING_MATCHES_HREF).toBe('/matches')
    expect(DASHBOARD_FRIEND_MATCHES_HREF).toBe('/friendship/matches')

    const source = matchesPreviewSource()
    expect(source).toContain("href={DASHBOARD_DATING_MATCHES_HREF}")
    expect(source).toContain("href={DASHBOARD_FRIEND_MATCHES_HREF}")
    expect(source).not.toMatch(/href=\{`\/members\//)
    expect(source).not.toContain("href={'/members/")
    expect(source).not.toContain('href="/members/')
    expect(source).not.toContain('CuratedMatchPassButton')
    expect(source).not.toContain('CuratedMatchIntroButton')
    expect(source).not.toContain('View full profile')
    expect(source).not.toContain('EventRsvp')
    expect(dashboardPageSource()).not.toMatch(/href=\{`\/members\//)
  })
})
