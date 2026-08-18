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

describe('Members dashboard layout', () => {
  it('does not show Your membership on the Members dashboard', () => {
    expect(membersDashboardShowsMembershipUsage()).toBe(false)

    const html = renderToStaticMarkup(
      createElement(MembersDashboardLayout, {
        heading: createElement('h1', null, 'Members'),
        directory: createElement('div', null, 'Member directory'),
        recentMessages: createElement('div', null, 'Recent messages'),
        curatedIntro: createElement('div', null, 'Curated Intro'),
      })
    )

    expect(html).not.toContain('Your membership')
    expect(html).not.toContain('Elite Circle')
    expect(html).not.toContain('event credit')
    expect(html).not.toContain('guest invite')

    const membersPage = readFileSync(
      join(repoRoot, 'app/(club)/members/page.tsx'),
      'utf8'
    )
    expect(membersPage).not.toContain('MembershipUsageCard')
    expect(membersPage).not.toContain('loadMemberEntitlementsForViewer')
    expect(membersPage).not.toContain('Your membership')
  })

  it('renders Curated Intro after Recent Messages in reading order', () => {
    const order = membersDashboardSectionOrder({
      showApprovalNotice: false,
      showAdmin: false,
      showRecentMessages: true,
      showCuratedIntro: true,
    })

    expect(order).toEqual([
      'heading',
      'directory',
      'recent_messages',
      'curated_intro',
    ])
    expect(order.indexOf('recent_messages')).toBeLessThan(
      order.indexOf('curated_intro')
    )

    const html = renderToStaticMarkup(
      createElement(MembersDashboardLayout, {
        heading: createElement('header', null, 'Page heading'),
        directory: createElement('section', null, 'Member directory'),
        recentMessages: createElement('section', null, 'Recent messages'),
        curatedIntro: createElement('section', null, 'Curated Intro'),
      })
    )

    const messagesAt = html.indexOf('Recent messages')
    const introAt = html.indexOf('Curated Intro')
    expect(messagesAt).toBeGreaterThan(-1)
    expect(introAt).toBeGreaterThan(-1)
    expect(messagesAt).toBeLessThan(introAt)
  })

  it('keeps Curated Intro after Recent Messages when admin block is present', () => {
    const order = membersDashboardSectionOrder({
      showApprovalNotice: false,
      showAdmin: true,
      showRecentMessages: true,
      showCuratedIntro: true,
    })

    expect(order.indexOf('admin')).toBeLessThan(order.indexOf('recent_messages'))
    expect(order.indexOf('recent_messages')).toBeLessThan(
      order.indexOf('curated_intro')
    )
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
