import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import MemberDiscoveryCard from '@/components/members/member-discovery-card'
import type { DirectoryMember } from '@/lib/members-discovery'

const stubMember: DirectoryMember = {
  id: 'member_abc',
  contactEmail: null,
  full_name: 'Alex Rivera',
  role: 'member',
  created_at: null,
  membership_intent: 'Looking to meet people at mixers.',
  verified_at: null,
  membership_status: 'approved',
  photos: [],
  location_area: 'Huntsville',
  discovery_intent: null,
  location_city: 'Huntsville',
  location_zip: null,
  birth_year: null,
  discovery_interests: [],
  discovery_industry: null,
  public_intents: [],
  verification_state: {},
  membership_tier: 'member',
  vendor_reviewed_badge: false,
}

describe('MemberDiscoveryCard messaging removal', () => {
  it('contains no opening-message textarea or Send message request button', () => {
    const html = renderToStaticMarkup(
      createElement(MemberDiscoveryCard, { member: stubMember })
    )

    expect(html).toContain('Alex Rivera')
    expect(html).toContain(`/members/${stubMember.id}`)
    expect(html).toContain('View profile')
    expect(html).toContain('hidden')
    expect(html).toContain('md:block')
    expect(html).toContain('focus-visible:outline-2')
    expect(html).not.toContain('<button')
    expect(html).not.toContain('Opening message')
    expect(html).not.toContain('Send message request')
    expect(html).not.toContain('<textarea')
    expect(html).not.toContain('Say hello')

    const source = readFileSync(
      join(__dirname, 'member-discovery-card.tsx'),
      'utf8'
    )
    expect(source).not.toContain('requestMemberIntro')
    expect(source).not.toContain('Opening message')
    expect(source).not.toContain('Send message request')
  })

  it('keeps private location fields off the card and preserves directory query state', () => {
    const html = renderToStaticMarkup(
      createElement(MemberDiscoveryCard, {
        member: {
          ...stubMember,
          location_city: 'Madison',
          location_zip: '35801',
          location_area: 'Downtown Huntsville',
        },
        directory: {
          search: 'Ada',
          browse: {
            browseMode: 'industry',
            intentFilter: 'all',
            industryFilter: 'aerospace_aviation_space',
          },
          page: 3,
        },
      })
    )

    expect(html).toContain('Downtown Huntsville')
    expect(html).not.toContain('Madison')
    expect(html).not.toContain('35801')
    expect(html).toContain(
      '/members/member_abc?q=Ada&amp;browse=industry&amp;industry=aerospace_aviation_space&amp;page=3'
    )
    expect(html).toContain('data-directory-card="member_abc"')
  })
})
