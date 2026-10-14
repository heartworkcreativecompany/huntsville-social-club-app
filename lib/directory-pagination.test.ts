import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import MemberDirectorySection from '@/components/members/member-directory-section'
import {
  clampDirectoryPage,
  directoryPageCount,
  directoryPageTokens,
  directoryResultSummary,
  directorySlice,
  MEMBER_DIRECTORY_PAGE_SIZE,
  parseDirectoryPage,
} from '@/lib/directory-pagination'
import {
  directoryBrowseNeedsEnrichedRoster,
  directoryHref,
  directoryNameIlikePattern,
  directoryQueryString,
  parseDirectoryQuery,
} from '@/lib/member-directory-query'
import {
  browseDirectoryMembers,
  DEFAULT_DIRECTORY_BROWSE_STATE,
  type DirectoryMember,
} from '@/lib/members-discovery'

const repoRoot = join(__dirname, '..')

function stubMember(id: string, fullName: string): DirectoryMember {
  return {
    id,
    contactEmail: null,
    full_name: fullName,
    role: 'member',
    created_at: null,
    membership_intent: null,
    verified_at: null,
    membership_status: 'approved',
    photos: [],
    location_area: null,
    discovery_intent: null,
    location_city: null,
    location_zip: null,
    birth_year: null,
    discovery_interests: [],
    discovery_industry: null,
    public_intents: id === 'late-match' ? ['friends'] : [],
    verification_state: {},
    membership_tier: 'member',
    vendor_reviewed_badge: false,
  }
}

function roster(count: number): DirectoryMember[] {
  return Array.from({ length: count }, (_, index) =>
    stubMember(
      `member-${String(index + 1).padStart(2, '0')}`,
      `Member ${String.fromCharCode(65 + (index % 26))}${index + 1}`
    )
  )
}

describe('directory pagination', () => {
  it('keeps nine profiles per page for empty, single, full, and partial pages', () => {
    expect(MEMBER_DIRECTORY_PAGE_SIZE).toBe(9)
    expect(directoryPageCount(0)).toBe(0)
    expect(directoryPageCount(1)).toBe(1)
    expect(directoryPageCount(9)).toBe(1)
    expect(directoryPageCount(10)).toBe(2)
    expect(directoryPageCount(18)).toBe(2)
    expect(directoryPageCount(19)).toBe(3)
    expect(directoryPageCount(43)).toBe(5)

    expect(directoryResultSummary(1, 0)).toBe('Showing 0 members.')
    expect(directoryResultSummary(1, 1)).toBe('Showing 1–1 of 1 member.')
    expect(directoryResultSummary(1, 9)).toBe('Showing 1–9 of 9 members.')
    expect(directoryResultSummary(1, 10)).toBe('Showing 1–9 of 10 members.')
    expect(directoryResultSummary(2, 10)).toBe('Showing 10–10 of 10 members.')
    expect(directoryResultSummary(2, 19)).toBe('Showing 10–18 of 19 members.')
    expect(directoryResultSummary(3, 19)).toBe('Showing 19–19 of 19 members.')
    expect(directoryResultSummary(1, 43)).toBe('Showing 1–9 of 43 members.')
    expect(directoryResultSummary(5, 43)).toBe('Showing 37–43 of 43 members.')

    for (const total of [0, 1, 9, 10, 19, 43]) {
      const sorted = browseDirectoryMembers(
        roster(total),
        DEFAULT_DIRECTORY_BROWSE_STATE
      )
      const seen = new Set<string>()
      const pages = directoryPageCount(total)
      for (let page = 1; page <= Math.max(pages, 1); page += 1) {
        const slice = directorySlice(sorted, page)
        expect(slice.length).toBe(
          total === 0 ? 0 : Math.min(9, total - (page - 1) * 9)
        )
        for (const member of slice) {
          expect(seen.has(member.id)).toBe(false)
          seen.add(member.id)
        }
      }
      expect(seen.size).toBe(total)
    }
  })

  it('clamps invalid pages and compacts long page lists', () => {
    expect(parseDirectoryPage('2')).toBe(2)
    expect(parseDirectoryPage('0')).toBe(1)
    expect(parseDirectoryPage('-3')).toBe(1)
    expect(parseDirectoryPage('10abc')).toBe(1)
    expect(parseDirectoryPage('')).toBe(1)
    expect(clampDirectoryPage(99, 43)).toBe(5)
    expect(clampDirectoryPage(4, 0)).toBe(1)
    expect(directoryPageTokens(1, 1)).toEqual([])
    expect(directoryPageTokens(2, 3)).toEqual([1, 2, 3])
    expect(directoryPageTokens(1, 10)).toEqual([1, 2, 'ellipsis', 10])
    expect(directoryPageTokens(5, 10)).toEqual([
      1,
      'ellipsis',
      4,
      5,
      6,
      'ellipsis',
      10,
    ])
    expect(directoryPageTokens(10, 10)).toEqual([1, 'ellipsis', 9, 10])
  })

  it('finds a name match that sits past the first unsorted page', () => {
    const members = [
      ...roster(12),
      stubMember('late-match', 'Zelda Quinn'),
    ]
    const unfiltered = browseDirectoryMembers(
      members,
      DEFAULT_DIRECTORY_BROWSE_STATE
    )
    expect(
      directorySlice(unfiltered, 1).some((member) => member.id === 'late-match')
    ).toBe(false)

    const matched = browseDirectoryMembers(
      members,
      { browseMode: 'intentions', intentFilter: 'friends', industryFilter: 'all' },
      '  zElDa  '
    )
    expect(matched.map((member) => member.id)).toEqual(['late-match'])
    expect(directorySlice(matched, 1).map((member) => member.id)).toEqual([
      'late-match',
    ])
    expect(directoryResultSummary(1, matched.length)).toBe(
      'Showing 1–1 of 1 member.'
    )
  })

  it('resets the page in the directory URL when search or filters change', () => {
    expect(
      parseDirectoryQuery({
        q: '  Ann ',
        browse: 'industry',
        industry: 'technology',
        intent: 'dating',
        page: '3',
      })
    ).toEqual({
      search: 'Ann',
      browse: {
        browseMode: 'industry',
        intentFilter: 'all',
        industryFilter: 'technology',
      },
      page: 3,
    })

    const filtered = parseDirectoryQuery({ intent: 'friends', page: '4' })
    expect(
      directoryQueryString({ ...filtered, search: 'Ann', page: 1 })
    ).toBe('?q=Ann&intent=friends')
    expect(directoryQueryString({ ...filtered, search: '', page: 1 })).toBe(
      '?intent=friends'
    )
    expect(directoryNameIlikePattern('Ann_Marie%')).toBe('%Ann\\_Marie\\%%')
    expect(directoryBrowseNeedsEnrichedRoster(DEFAULT_DIRECTORY_BROWSE_STATE)).toBe(
      false
    )
    expect(
      directoryBrowseNeedsEnrichedRoster({
        browseMode: 'intentions',
        intentFilter: 'dating',
        industryFilter: 'all',
      })
    ).toBe(true)
    expect(directoryHref('/members', { ...filtered, page: 2 })).toBe(
      '/members?intent=friends&page=2'
    )
  })

  it('renders the current page, disabled edges, and hides a single page', () => {
    const html = renderToStaticMarkup(
      createElement(MemberDirectorySection, {
        members: roster(9),
        matchCount: 19,
        eligibleCount: 19,
        page: 2,
        search: '',
        pageHref: (page: number) => `/members?page=${page}`,
      })
    )

    expect(html).toContain('Showing 10–18 of 19 members.')
    expect(html).toContain('aria-current="page"')
    expect(html).toContain('aria-label="Page 2, current"')
    expect(html).toContain('href="/members?page=1"')
    expect(html).toContain('href="/members?page=3"')
    expect(html).toContain('Previous')
    expect(html).toContain('Next')
    expect(html).not.toContain('disabled')
    expect(html).toContain('sm:grid-cols-2 lg:grid-cols-3')

    const firstPage = renderToStaticMarkup(
      createElement(MemberDirectorySection, {
        members: roster(9),
        matchCount: 19,
        eligibleCount: 19,
        page: 1,
        pageHref: (page: number) => `/members?page=${page}`,
      })
    )
    expect(firstPage).toContain('disabled')
    expect(firstPage).toContain('>Previous<')

    const lastPage = renderToStaticMarkup(
      createElement(MemberDirectorySection, {
        members: roster(1),
        matchCount: 19,
        eligibleCount: 19,
        page: 3,
        pageHref: (page: number) => `/members?page=${page}`,
      })
    )
    expect(lastPage).toContain('>Next<')
    expect(lastPage.match(/disabled/g)?.length).toBe(1)

    const onlyPage = renderToStaticMarkup(
      createElement(MemberDirectorySection, {
        members: roster(4),
        matchCount: 4,
        eligibleCount: 4,
        page: 1,
      })
    )
    expect(onlyPage).not.toContain('Member directory pages')

    const noMatches = renderToStaticMarkup(
      createElement(MemberDirectorySection, {
        members: [],
        matchCount: 0,
        eligibleCount: 12,
        page: 1,
        search: 'Nobody',
      })
    )
    expect(noMatches).toContain('No matches')
    expect(noMatches).toContain('No members match that name.')
    expect(noMatches).toContain('Showing 0 members.')
    expect(noMatches).not.toContain('Member directory pages')
  })

  it('searches the approved directory by display name and pages after filtering', () => {
    const source = readFileSync(
      join(repoRoot, 'lib/load-directory-profiles.ts'),
      'utf8'
    )
    expect(source).toContain("const DIRECTORY_INDEX_FIELDS = 'id, full_name'")
    expect(source).toContain(".ilike('full_name', directoryNameIlikePattern(name))")
    expect(source).toContain(".eq('application_status', 'approved')")
    expect(source).toContain(".neq('id', viewerId)")
    expect(source).toContain('browseDirectoryMembers')
    expect(source).toContain('directorySlice')
    expect(source).not.toContain("ilike('email'")
    expect(source).not.toContain('email.ilike')
    expect(source).toContain('location_city: null')
  })
})
