import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  getRedirectStatusCodeFromError,
  getURLFromRedirectError,
  permanentRedirect,
} from 'next/dist/client/components/redirect'
import { RedirectStatusCode } from 'next/dist/client/components/redirect-status-code'
import {
  CANONICAL_DATING_INBOX_PATH,
  CANONICAL_FRIENDS_INBOX_PATH,
  incomingSearchString,
  LEGACY_DATING_INBOX_PATH,
  LEGACY_FRIENDS_INBOX_PATH,
  LEGACY_INBOX_REDIRECT_STATUS,
  searchParamsToQueryString,
  withIncomingQuery,
} from '@/lib/legacy-inbox-redirect'
import { MEMBER_NOTIFICATION_TEMPLATES } from '@/lib/member-notifications'

const repoRoot = join(__dirname, '..')

function source(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), 'utf8')
}

describe('legacy inbox redirects', () => {
  it('uses a 308 and preserves the incoming query string exactly', () => {
    expect(LEGACY_INBOX_REDIRECT_STATUS).toBe(308)
    expect(withIncomingQuery('/matches/dating', '')).toBe('/matches/dating')
    expect(withIncomingQuery('/matches/dating', '?')).toBe('/matches/dating')
    expect(withIncomingQuery('/matches/dating', '?utm=nav&next=%2Fprofile')).toBe(
      '/matches/dating?utm=nav&next=%2Fprofile'
    )
    expect(withIncomingQuery('/matches/friends', 'ref=email')).toBe(
      '/matches/friends?ref=email'
    )
    expect(
      searchParamsToQueryString({ utm: 'nav', next: '/profile' })
    ).toBe('?utm=nav&next=%2Fprofile')

    const exact = '?utm=nav&next=%2Fprofile&flag'
    expect(
      incomingSearchString(
        { utm: 'other' },
        (name) =>
          name === 'x-url'
            ? `https://example.test/matches${exact}`
            : null
      )
    ).toBe(exact)
    expect(withIncomingQuery('/matches/dating', exact)).toBe(
      `/matches/dating${exact}`
    )
    expect(RedirectStatusCode.PermanentRedirect).toBe(308)
    expect(LEGACY_INBOX_REDIRECT_STATUS).toBe(
      RedirectStatusCode.PermanentRedirect
    )

    try {
      permanentRedirect(
        withIncomingQuery('/matches/dating', '?utm=nav&next=%2Fprofile')
      )
      throw new Error('expected a redirect')
    } catch (error) {
      const redirectError = error as Parameters<
        typeof getRedirectStatusCodeFromError
      >[0]
      expect(getRedirectStatusCodeFromError(redirectError)).toBe(308)
      expect(getURLFromRedirectError(redirectError)).toBe(
        '/matches/dating?utm=nav&next=%2Fprofile'
      )
    }
  })

  it('sends legacy /matches to /matches/dating with a permanent redirect', () => {
    const page = source('app/(club)/matches/page.tsx')
    expect(page).toContain('permanentRedirect')
    expect(page).toContain('LEGACY_INBOX_REDIRECT_STATUS')
    expect(page).toContain("withIncomingQuery('/matches/dating'")
    expect(page).toContain('incomingSearchString')
    expect(page).not.toContain('loadCuratedMatchRecommendations')
    expect(page).not.toContain("permanentRedirect('/matches'")
    expect(LEGACY_DATING_INBOX_PATH).toBe('/matches')
    expect(CANONICAL_DATING_INBOX_PATH).toBe('/matches/dating')
  })

  it('sends legacy /friendship/matches to /matches/friends with a permanent redirect', () => {
    const page = source('app/(club)/friendship/matches/page.tsx')
    expect(page).toContain('permanentRedirect')
    expect(page).toContain('LEGACY_INBOX_REDIRECT_STATUS')
    expect(page).toContain("withIncomingQuery('/matches/friends'")
    expect(page).toContain('incomingSearchString')
    expect(page).not.toContain('loadFriendshipMatchRecommendations')
    expect(page).not.toContain("permanentRedirect('/friendship/matches'")
    expect(LEGACY_FRIENDS_INBOX_PATH).toBe('/friendship/matches')
    expect(CANONICAL_FRIENDS_INBOX_PATH).toBe('/matches/friends')
  })

  it('does not bounce canonical inboxes back through legacy routes', () => {
    const dating = source('app/(club)/matches/dating/page.tsx')
    const friends = source('app/(club)/matches/friends/page.tsx')
    expect(dating).not.toContain('permanentRedirect')
    expect(friends).not.toContain('permanentRedirect')
    expect(dating).not.toContain("redirect('/matches'")
    expect(friends).not.toContain("redirect('/friendship/matches'")
  })
})

describe('canonical inbox titles and loaders', () => {
  it('keeps dating inbox behavior and titles the page Dating Matches', () => {
    const page = source('app/(club)/matches/dating/page.tsx')
    expect(page).toContain('title="Dating Matches"')
    expect(page).not.toContain('title="Curated matches"')
    expect(page).toContain("redirect('/login')")
    expect(page).toContain("redirect('/application')")
    expect(page).toContain('healStaleSubscriptionInactivePause')
    expect(page).toContain('isCompatibilityFeatureEnabled')
    expect(page).toContain('canAccessMatchesInbox')
    expect(page).toContain('syncRecommendationLifecycleForMember')
    expect(page).toContain('loadCuratedMatchRecommendations')
    expect(page).toContain('sortCuratedMatchItems')
    expect(page).toContain('HowCompatibilityWorksInlineSummary')
    expect(page).not.toContain('@/app/(club)/matches/actions')
    const howItWorksBlocks = page.split('<HowCompatibilityWorksInlineSummary')
    expect(howItWorksBlocks.length).toBe(2)
    const blockedBranch = page.slice(
      page.indexOf('if (!context.canAccessMatchesInbox)'),
      page.indexOf('syncRecommendationLifecycleForMember')
    )
    expect(blockedBranch).not.toContain('HowCompatibilityWorksInlineSummary')
  })

  it('keeps friendship inbox behavior and titles the page Matched Friends', () => {
    const page = source('app/(club)/matches/friends/page.tsx')
    expect(page).toContain('title="Matched Friends"')
    expect(page).not.toContain('title="Friend recommendations"')
    expect(page).toContain("redirect('/login')")
    expect(page).toContain("redirect('/application')")
    expect(page).toContain('resolveFriendshipMatchesView')
    expect(page).toContain('view.loadRecommendations')
    expect(page).toContain('loadFriendshipMatchRecommendations')
    expect(page).toContain("view.kind === 'gated'")
    expect(page).not.toContain('redirect(view.href)')
    expect(page).not.toContain("redirect('/friendship')")
  })
})

describe('canonical hrefs, notifications, and revalidation', () => {
  it('keeps stored notification dating links on the legacy path', () => {
    expect(MEMBER_NOTIFICATION_TEMPLATES.curated_matches_delivered.href).toBe(
      '/matches'
    )
    expect(source('lib/message-request-notifications.ts')).toContain(
      "href: '/matches'"
    )
    expect(source('lib/member-notifications.ts')).toContain("href: '/matches'")
  })

  it('points new member-facing dating and friends links at canonical routes', () => {
    expect(source('lib/compatibility/profile-status.ts')).toContain(
      "ctaHref: '/matches/dating'"
    )
    expect(source('lib/friendship/eligibility.ts')).toContain(
      "ctaHref: '/matches/friends'"
    )
    expect(source('app/(club)/friendship/page.tsx')).toContain(
      'href="/matches/friends"'
    )
    expect(source('app/(club)/compatibility/how-it-works/page.tsx')).toContain(
      'href="/matches/dating"'
    )
    expect(source('app/(club)/compatibility/how-it-works/page.tsx')).toContain(
      '← Dating Matches'
    )
    expect(source('components/messages/messages-inbox.tsx')).toContain(
      'href="/matches/dating"'
    )
    expect(source('lib/transactional-email.ts')).toContain(
      '${origin}/matches/dating'
    )
    expect(source('lib/transactional-email.ts')).not.toContain(
      '${origin}/matches`'
    )
    expect(
      source('components/matches/curated-match-intro-button.tsx')
    ).toContain("@/app/(club)/matches/actions")
    expect(
      source('components/matches/curated-match-pass-button.tsx')
    ).toContain("@/app/(club)/matches/actions")
  })

  it('invalidates canonical inbox paths while keeping legacy revalidation', () => {
    const curated = source('lib/compatibility/revalidate-curated-match-routes.ts')
    const friendship = source('lib/friendship/revalidate-routes.ts')
    const messages = source('app/(club)/messages/actions.ts')
    const admin = source('app/(club)/admin/curated-matches/actions.ts')

    expect(curated).toContain("revalidatePath('/matches')")
    expect(curated).toContain("revalidatePath('/matches/dating')")
    expect(friendship).toContain("revalidatePath('/friendship/matches')")
    expect(friendship).toContain("revalidatePath('/matches/friends')")
    expect(messages).toContain("revalidatePath('/matches')")
    expect(messages).toContain("revalidatePath('/matches/dating')")
    expect(admin).toContain("revalidatePath('/friendship/matches')")
    expect(admin).toContain("revalidatePath('/matches/friends')")
  })
})
