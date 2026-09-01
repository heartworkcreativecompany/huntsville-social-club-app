import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  MembersDashboardLayout,
  membersDashboardSectionOrder,
  membersDashboardShowsMembershipUsage,
  yourProfileShowsMembershipUsage,
} from '@/components/members/members-dashboard-layout'

const repoRoot = join(__dirname, '../..')

function membersPageSource() {
  return readFileSync(join(repoRoot, 'app/(club)/members/page.tsx'), 'utf8')
}

describe('Members directory layout', () => {
  it('does not show Your membership on the Members directory', () => {
    expect(membersDashboardShowsMembershipUsage()).toBe(false)

    const html = renderToStaticMarkup(
      createElement(MembersDashboardLayout, {
        heading: createElement('h1', null, 'Member directory'),
        directory: createElement('div', null, 'Member directory'),
      })
    )

    expect(html).not.toContain('Your membership')
    expect(html).not.toContain('Elite Circle')
    expect(html).not.toContain('event credit')
    expect(html).not.toContain('guest invite')

    const membersPage = membersPageSource()
    expect(membersPage).not.toContain('MembershipUsageCard')
    expect(membersPage).not.toContain('loadMemberEntitlementsForViewer')
    expect(membersPage).not.toContain('Your membership')
  })

  it('keeps a directory-only section order', () => {
    const order = membersDashboardSectionOrder({
      showApprovalNotice: false,
      showAdmin: false,
    })

    expect(order).toEqual(['heading', 'directory'])

    const withAdmin = membersDashboardSectionOrder({
      showApprovalNotice: false,
      showAdmin: true,
    })
    expect(withAdmin).toEqual(['heading', 'directory', 'admin'])
    expect(withAdmin).not.toContain('recent_messages')
    expect(withAdmin).not.toContain('curated_intro')
  })

  it('no longer renders moved Dashboard modules on the Members page', () => {
    const membersPage = membersPageSource()

    expect(membersPage).toContain('MemberDirectorySection')
    expect(membersPage).toContain('loadDirectoryProfiles')
    expect(membersPage).toContain('title="Member directory"')
    expect(membersPage).not.toContain('RecentMessagesPreview')
    expect(membersPage).not.toContain('CuratedIntroCard')
    expect(membersPage).not.toContain('loadRecentMessagePreviews')
    expect(membersPage).not.toContain('title="Dashboard"')
    expect(membersPage).not.toContain(
      'Your dashboard for curated intros, member discovery, and recent conversations.'
    )
    expect(membersPage).not.toContain('eyebrow="Discovery"')
  })
})

describe('Your Profile membership surface', () => {
  it('continues to show membership information on Your Profile', () => {
    expect(yourProfileShowsMembershipUsage()).toBe(true)
    expect(membersDashboardShowsMembershipUsage()).toBe(false)

    const profilePage = readFileSync(
      join(repoRoot, 'app/(club)/profile/page.tsx'),
      'utf8'
    )
    expect(profilePage).toContain('MembershipUsageCard')
    expect(profilePage).toContain('loadMemberEntitlementsForViewer')
    expect(profilePage).toMatch(
      /<MembershipUsageCard\s+entitlements=\{entitlements\}/
    )
  })
})
