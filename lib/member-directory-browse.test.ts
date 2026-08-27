import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import MemberDirectoryBrowseControls, {
  DIRECTORY_BROWSE_FIELD_CLASS,
  DIRECTORY_BROWSE_LAYOUT_CLASS,
  DIRECTORY_INDUSTRY_HINT_CLASS,
} from '@/components/members/member-directory-browse-controls'
import MemberDirectorySection from '@/components/members/member-directory-section'
import { DIRECTORY_INTENT_PILLS_CLASS } from '@/components/members/member-intent-filter-pills'
import { chipActiveClassName, inputClassName } from '@/lib/event-labels'
import { INDUSTRY_OPTIONS } from '@/lib/industries'
import {
  DEFAULT_DIRECTORY_BROWSE_STATE,
  DEFAULT_DISCOVERY_FILTERS,
  applyDirectoryBrowseModeChange,
  browseDirectoryMembers,
  directoryEmptyStateDescription,
  directoryFiltersForBrowse,
  directorySortForBrowse,
  parseDirectoryBrowseState,
  parseDirectoryIndustryFilter,
  parseDirectoryIntentFilter,
  type DirectoryMember,
} from '@/lib/members-discovery'

const repoRoot = join(__dirname, '..')

function stubMember(
  patch: Partial<DirectoryMember> = {}
): DirectoryMember {
  return {
    id: 'member_abc',
    contactEmail: null,
    full_name: 'Alex Rivera',
    role: 'member',
    created_at: null,
    membership_intent: null,
    verified_at: null,
    membership_status: 'approved',
    photos: [],
    location_area: 'Huntsville',
    discovery_intent: null,
    location_city: null,
    location_zip: null,
    birth_year: null,
    discovery_interests: [],
    discovery_industry: null,
    public_intents: [],
    verification_state: {},
    membership_tier: 'member',
    vendor_reviewed_badge: false,
    ...patch,
  }
}

const members = [
  stubMember({
    id: 'tech-dating',
    full_name: 'Taylor Tech',
    discovery_industry: 'technology',
    public_intents: ['dating'],
  }),
  stubMember({
    id: 'food-friends',
    full_name: 'Frankie Food',
    discovery_industry: 'food_beverage',
    public_intents: ['friends'],
  }),
  stubMember({
    id: 'legacy-networking',
    full_name: 'Legacy Label',
    discovery_industry: 'Technology',
    public_intents: ['networking'],
  }),
  stubMember({
    id: 'none-all',
    full_name: 'No Industry',
    discovery_industry: null,
    public_intents: ['dating', 'friends'],
  }),
]

function directorySectionSource() {
  return readFileSync(
    join(repoRoot, 'components/members/member-directory-section.tsx'),
    'utf8'
  )
}

function browseControlsSource() {
  return readFileSync(
    join(
      repoRoot,
      'components/members/member-directory-browse-controls.tsx'
    ),
    'utf8'
  )
}

function directoryLibSource() {
  return readFileSync(join(repoRoot, 'lib/members-discovery.ts'), 'utf8')
}

function loadDirectorySource() {
  return readFileSync(join(repoRoot, 'lib/load-directory-profiles.ts'), 'utf8')
}

function profileFieldsSource() {
  return readFileSync(join(repoRoot, 'lib/profile-query-fields.ts'), 'utf8')
}

describe('default directory browse UI', () => {
  it('defaults to Browse by Intentions with All selected', () => {
    expect(DEFAULT_DIRECTORY_BROWSE_STATE).toEqual({
      browseMode: 'intentions',
      intentFilter: 'all',
      industryFilter: 'all',
    })

    const html = renderToStaticMarkup(
      createElement(MemberDirectorySection, { members })
    )

    expect(html).toContain('Browse by')
    expect(html).toContain('Intentions')
    expect(html).toContain('Industry')
    expect(html).toContain('>All<')
    expect(html).toContain('Networking')
    expect(html).toContain('Dating')
    expect(html).toContain('Friends')
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('Showing 4 of 4 members')
    expect(html).not.toContain('All industries')
    expect(html).not.toContain('Name: A–Z')
    expect(html).not.toContain('Industry: A–Z')
    expect(html).not.toContain('Members are grouped alphabetically by industry.')
  })
})

describe('intentions browse mode', () => {
  it('renders only intention choices and keeps name A–Z ordering', () => {
    const html = renderToStaticMarkup(
      createElement(MemberDirectoryBrowseControls, {
        state: DEFAULT_DIRECTORY_BROWSE_STATE,
        onBrowseModeChange: () => undefined,
        onIntentFilterChange: () => undefined,
        onIndustryFilterChange: () => undefined,
      })
    )

    expect(html).toContain('Filter by intention')
    expect(html).toContain('Networking')
    expect(html).not.toContain('All industries')
    expect(html).not.toContain('Arts &amp; Entertainment')
    expect(directorySortForBrowse('intentions')).toBe('name')

    const visible = browseDirectoryMembers(members, {
      browseMode: 'intentions',
      intentFilter: 'friends',
      industryFilter: 'technology',
    })
    expect(visible.map((member) => member.id)).toEqual([
      'food-friends',
      'none-all',
    ])
    expect(directoryFiltersForBrowse({
      browseMode: 'intentions',
      intentFilter: 'friends',
      industryFilter: 'technology',
    })).toMatchObject({
      intentFilter: 'friends',
      industryFilter: '',
    })
  })
})

describe('industry browse mode', () => {
  it('renders only the canonical Industry dropdown and filters by discovery_industry', () => {
    const html = renderToStaticMarkup(
      createElement(MemberDirectoryBrowseControls, {
        state: {
          browseMode: 'industry',
          intentFilter: 'all',
          industryFilter: 'all',
        },
        onBrowseModeChange: () => undefined,
        onIntentFilterChange: () => undefined,
        onIndustryFilterChange: () => undefined,
      })
    )

    expect(html).toContain('All industries')
    expect(html).toContain('Members are grouped alphabetically by industry.')
    expect(html).not.toContain('Networking')
    expect(html).not.toContain('Filter by intention')
    for (const option of INDUSTRY_OPTIONS) {
      expect(html).toContain(option.label.replace('&', '&amp;'))
      expect(html).toContain(`value="${option.value}"`)
    }

    const filtered = browseDirectoryMembers(members, {
      browseMode: 'industry',
      intentFilter: 'dating',
      industryFilter: 'technology',
    })
    expect(filtered.map((member) => member.id)).toEqual([
      'tech-dating',
      'legacy-networking',
    ])
    expect(
      directoryFiltersForBrowse({
        browseMode: 'industry',
        intentFilter: 'dating',
        industryFilter: 'technology',
      })
    ).toMatchObject({
      ...DEFAULT_DISCOVERY_FILTERS,
      intentFilter: 'all',
      industryFilter: 'technology',
    })
  })

  it('uses deterministic Industry A–Z ordering in industry mode', () => {
    expect(directorySortForBrowse('industry')).toBe('industry')
    const sorted = browseDirectoryMembers(members, {
      browseMode: 'industry',
      intentFilter: 'all',
      industryFilter: 'all',
    })
    expect(sorted.map((member) => member.id)).toEqual([
      'food-friends',
      'tech-dating',
      'none-all',
      'legacy-networking',
    ])
  })

  it('includes every directory-visible member for All industries', () => {
    const visible = browseDirectoryMembers(members, {
      browseMode: 'industry',
      intentFilter: 'friends',
      industryFilter: 'all',
    })
    expect(visible.map((member) => member.id).sort()).toEqual(
      members.map((member) => member.id).sort()
    )
  })

  it('keeps legacy free-text industry filter compatibility', () => {
    const visible = browseDirectoryMembers(members, {
      browseMode: 'industry',
      intentFilter: 'all',
      industryFilter: 'technology',
    })
    expect(visible.map((member) => member.id).sort()).toEqual([
      'legacy-networking',
      'tech-dating',
    ])
  })
})

describe('switching browse modes', () => {
  it('clears the inactive filter when changing modes', () => {
    const toIndustry = applyDirectoryBrowseModeChange(
      {
        browseMode: 'intentions',
        intentFilter: 'dating',
        industryFilter: 'all',
      },
      'industry'
    )
    expect(toIndustry).toEqual({
      browseMode: 'industry',
      intentFilter: 'all',
      industryFilter: 'all',
    })

    const toIntentions = applyDirectoryBrowseModeChange(
      {
        browseMode: 'industry',
        intentFilter: 'all',
        industryFilter: 'technology',
      },
      'intentions'
    )
    expect(toIntentions).toEqual({
      browseMode: 'intentions',
      intentFilter: 'all',
      industryFilter: 'all',
    })
  })
})

describe('counts and empty states', () => {
  it('reports filtered counts and contextual empty copy', () => {
    const dating = browseDirectoryMembers(members, {
      browseMode: 'intentions',
      intentFilter: 'dating',
      industryFilter: 'all',
    })
    expect(dating).toHaveLength(2)

    const emptyIndustry = browseDirectoryMembers(members, {
      browseMode: 'industry',
      intentFilter: 'all',
      industryFilter: 'legal_services',
    })
    expect(emptyIndustry).toHaveLength(0)
    expect(directoryEmptyStateDescription('industry')).toBe(
      'No members found in this industry yet.'
    )
    expect(directoryEmptyStateDescription('intentions')).toBe(
      'No members found with this intention yet.'
    )

    const html = renderToStaticMarkup(
      createElement(MemberDirectorySection, {
        members: [
          stubMember({
            id: 'only-tech',
            discovery_industry: 'technology',
            public_intents: ['networking'],
          }),
        ],
      })
    )
    expect(html).toContain('Showing 1 of 1 members')
    expect(html).not.toContain('employer')
    expect(html).not.toContain('company')
  })
})

describe('privacy and data selectors', () => {
  it('never uses employer or company fields for directory filters, sorting, or rendering', () => {
    const sources = [
      directorySectionSource(),
      browseControlsSource(),
      directoryLibSource(),
      loadDirectorySource(),
      profileFieldsSource(),
      readFileSync(
        join(repoRoot, 'components/members/member-discovery-card.tsx'),
        'utf8'
      ),
    ]
    for (const source of sources) {
      expect(source).not.toMatch(/employerCompany|employer_company/)
      expect(source).not.toMatch(/\bemployer\b/)
    }

    expect(directoryLibSource()).toContain('member.discovery_industry')
    expect(directoryLibSource()).toContain('compareIndustries(')
    expect(directoryLibSource()).toContain('memberIndustryMatchesFilter')
    expect(loadDirectorySource()).toContain('location_city: null')
    expect(loadDirectorySource()).toContain('location_zip: null')
    expect(loadDirectorySource()).toContain('birth_year: null')
  })
})

describe('invalid persisted browse values', () => {
  it('falls back safely to Intentions and All', () => {
    expect(
      parseDirectoryBrowseState({
        browseMode: 'jobs',
        intentFilter: 'mixed',
        industryFilter: 'Aerospace',
      })
    ).toEqual(DEFAULT_DIRECTORY_BROWSE_STATE)
    expect(parseDirectoryIntentFilter('mixed')).toBe('all')
    expect(parseDirectoryIndustryFilter('Aerospace')).toBe('all')
    expect(parseDirectoryIndustryFilter('technology')).toBe('technology')
    expect(directorySectionSource()).not.toContain('useSearchParams')
    expect(directorySectionSource()).not.toContain('searchParams')
  })
})

describe('mobile directory browse layout', () => {
  it('keeps browse controls full-width, wrapping, and 44px tall on narrow screens', () => {
    expect(DIRECTORY_BROWSE_LAYOUT_CLASS).toContain('grid')
    expect(DIRECTORY_BROWSE_LAYOUT_CLASS).toContain('min-w-0')
    expect(DIRECTORY_BROWSE_LAYOUT_CLASS).not.toContain('overflow-x')
    expect(DIRECTORY_BROWSE_FIELD_CLASS).toContain('min-w-0')
    expect(DIRECTORY_INTENT_PILLS_CLASS).toContain('flex-wrap')
    expect(DIRECTORY_INTENT_PILLS_CLASS).toContain('min-w-0')
    expect(inputClassName).toContain('min-h-11')
    expect(inputClassName).toContain('w-full')
    expect(inputClassName).toContain('min-w-0')
    expect(DIRECTORY_INDUSTRY_HINT_CLASS).toContain('text-xs')

    const pillsSource = readFileSync(
      join(repoRoot, 'components/members/member-intent-filter-pills.tsx'),
      'utf8'
    )
    expect(pillsSource).toContain('aria-pressed')
    expect(pillsSource).toContain('chipActiveClassName')
    expect(chipActiveClassName).toContain('min-h-11')
    expect(browseControlsSource()).not.toContain('overflow-x-auto')
    expect(directorySectionSource()).not.toContain('Industry: A–Z')
  })
})
