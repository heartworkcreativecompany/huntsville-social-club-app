import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { ClubNavMarkup } from '@/components/shell/club-nav'
import {
  CLUB_MOBILE_NAV_ID,
  isMobileNavEscapeKey,
  isOutsideMobileNav,
  mobileNavToggleLabel,
} from '@/lib/club-mobile-nav'
import { buildClubNavItems, clubLogoHref } from '@/lib/club-nav-items'

vi.mock('@/components/shell/notifications-bell', () => ({
  default: function NotificationsBellStub() {
    return createElement('div', { 'data-notifications-bell': 'true' })
  },
}))

const memberItems = buildClubNavItems({
  role: 'member',
  canAccessApp: true,
  applicationStatus: 'approved',
  showMatchesNav: false,
})

const adminItems = buildClubNavItems({
  role: 'admin',
  canAccessApp: true,
  applicationStatus: 'approved',
  showMatchesNav: false,
})

function renderNav({
  items = memberItems,
  pathname = '/members',
  mobileOpen = false,
}: {
  items?: ReturnType<typeof buildClubNavItems>
  pathname?: string
  mobileOpen?: boolean
} = {}) {
  return renderToStaticMarkup(
    createElement(ClubNavMarkup, {
      items,
      logoHref: clubLogoHref(true),
      pathname,
      mobileOpen,
      notifications: [],
      unreadNotificationCount: 0,
      onToggleMobileNav: () => undefined,
      onCloseMobileNav: () => undefined,
    })
  )
}

describe('buildClubNavItems', () => {
  it('includes club destinations and omits Admin for members', () => {
    expect(memberItems.map((item) => item.label)).toEqual([
      'Members',
      'Events',
      'Business Directory',
      'Messages',
      'Your Profile',
    ])
    expect(memberItems.map((item) => item.href)).toEqual([
      '/members',
      '/events',
      '/business',
      '/messages',
      '/profile',
    ])
  })

  it('includes Admin only for admins', () => {
    expect(adminItems.some((item) => item.label === 'Admin')).toBe(true)
    expect(adminItems.find((item) => item.label === 'Admin')?.href).toBe(
      '/admin/applications'
    )
    expect(memberItems.some((item) => item.label === 'Admin')).toBe(false)
  })

  it('marks the active route for Members and nested member profiles', () => {
    const members = memberItems.find((item) => item.href === '/members')
    expect(members?.isActive('/members')).toBe(true)
    expect(members?.isActive('/members/abc')).toBe(true)
    expect(members?.isActive('/events')).toBe(false)
  })

  it('includes Matches and Friends only when those surfaces are enabled', () => {
    const items = buildClubNavItems({
      role: 'member',
      canAccessApp: true,
      applicationStatus: 'approved',
      showMatchesNav: true,
      showFriendsNav: true,
    })
    expect(items.map((item) => item.label)).toEqual([
      'Members',
      'Events',
      'Business Directory',
      'Messages',
      'Matches',
      'Friends',
      'Your Profile',
    ])
  })

  it('keeps applicant destinations when the club app is locked', () => {
    const items = buildClubNavItems({
      role: 'member',
      canAccessApp: false,
      applicationStatus: 'submitted',
      showMatchesNav: false,
    })
    expect(items.map((item) => [item.label, item.href])).toEqual([
      ['Application', '/application'],
      ['Status', '/application/status'],
    ])
    expect(clubLogoHref(false)).toBe('/application')
    expect(clubLogoHref(true)).toBe('/members')
  })
})

describe('ClubNavMarkup', () => {
  it('keeps desktop navigation in the document and hides it below lg', () => {
    const html = renderNav({ mobileOpen: false })
    expect(html).toContain('data-club-header="desktop"')
    expect(html).toContain('hidden max-w-6xl')
    expect(html).toContain('lg:flex')
    expect(html).toContain('flex flex-wrap gap-1')
    expect(html).toContain('Members')
    expect(html).toContain('href="/members"')
    expect(html).toContain('href="/events"')
    expect(html).toContain('href="/business"')
    expect(html).toContain('href="/messages"')
    expect(html).toContain('href="/profile"')
    expect(html).toContain('Sign out')
  })

  it('places the mobile header as bell, centered wordmark, then hamburger', () => {
    const html = renderNav({ mobileOpen: false })
    const mobileHtml = html.slice(
      html.indexOf('data-club-header="mobile"'),
      html.indexOf('data-club-header="desktop"')
    )

    expect(mobileHtml).toContain('grid-cols-[44px_minmax(0,1fr)_44px]')
    expect(mobileHtml).toContain('lg:hidden')
    expect(mobileHtml).toContain('h-11 w-11 min-h-11 min-w-11')
    expect(mobileHtml).toContain('justify-center')

    const bellAt = mobileHtml.indexOf('data-notifications-bell')
    const wordmarkAt = mobileHtml.indexOf('Huntsville Social Club')
    const hamburgerAt = mobileHtml.indexOf('aria-label="Open navigation menu"')

    expect(bellAt).toBeGreaterThan(-1)
    expect(wordmarkAt).toBeGreaterThan(bellAt)
    expect(hamburgerAt).toBeGreaterThan(wordmarkAt)
  })

  it('keeps the wordmark in the mobile header when the menu is open', () => {
    const html = renderNav({ mobileOpen: true })
    const mobileHtml = html.slice(
      html.indexOf('data-club-header="mobile"'),
      html.indexOf('data-club-header="desktop"')
    )
    expect(mobileHtml).toContain('Huntsville Social Club')
    expect(mobileHtml).toContain('aria-label="Close navigation menu"')
    expect(html).toContain('id="club-mobile-nav"')
    expect(html.indexOf('data-club-header="mobile"')).toBeLessThan(
      html.indexOf('id="club-mobile-nav"')
    )
  })

  it('shows a closed hamburger with accessible state and hides the panel', () => {
    const html = renderNav({ mobileOpen: false })
    expect(html).toContain('aria-label="Open navigation menu"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain(`aria-controls="${CLUB_MOBILE_NAV_ID}"`)
    expect(html).toContain(`id="${CLUB_MOBILE_NAV_ID}"`)
    expect(html).toContain('lg:hidden')
    expect(html).toContain('h-11 w-11 min-h-11 min-w-11')
    expect(html).toMatch(/<nav id="club-mobile-nav"[^>]*\shidden/)
    expect(html).toContain('d="M4 7h16"')
    expect(html).not.toContain('d="M6 6l12 12"')
  })

  it('opens into an X, updates the label, and reveals the same destinations', () => {
    const html = renderNav({ mobileOpen: true, pathname: '/members' })
    expect(html).toContain('aria-label="Close navigation menu"')
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('d="M6 6l12 12"')
    expect(html).not.toMatch(/<nav id="club-mobile-nav"[^>]*\shidden/)
    expect(html).toContain('min-h-11 w-full')
    expect(html).toContain('bg-accent text-accent-foreground')
    expect(html).toContain('Your Profile')
    expect(html).not.toContain('>Admin<')
  })

  it('shows Admin in the mobile list only for admins', () => {
    const memberHtml = renderNav({ mobileOpen: true, items: memberItems })
    const adminHtml = renderNav({ mobileOpen: true, items: adminItems })
    expect(memberHtml).not.toContain('>Admin<')
    expect(adminHtml).toContain('>Admin<')
    expect(adminHtml).toContain('href="/admin/applications"')
  })

  it('keeps Sign out as a form action in desktop and mobile surfaces', () => {
    const html = renderNav({ mobileOpen: true })
    expect(html).toContain('Sign out')
    expect(html.match(/Sign out/g)?.length).toBe(2)
  })
})

describe('mobile nav dismiss helpers', () => {
  it('closes on Escape and treats clicks outside the header as dismissals', () => {
    expect(isMobileNavEscapeKey('Escape')).toBe(true)
    expect(isMobileNavEscapeKey('Enter')).toBe(false)
    expect(mobileNavToggleLabel(false)).toBe('Open navigation menu')
    expect(mobileNavToggleLabel(true)).toBe('Close navigation menu')
    expect(isOutsideMobileNav(null, { contains: () => true })).toBe(true)
    expect(
      isOutsideMobileNav({} as EventTarget, { contains: () => false })
    ).toBe(true)
    expect(
      isOutsideMobileNav({} as EventTarget, { contains: () => true })
    ).toBe(false)
  })
})

describe('ClubNav interaction wiring', () => {
  it('closes on Escape, outside click, link click, and client-side navigation', () => {
    const source = readFileSync(
      join(__dirname, '../components/shell/club-nav.tsx'),
      'utf8'
    )
    expect(source).toContain('isMobileNavEscapeKey(event.key)')
    expect(source).toContain(
      'isOutsideMobileNav(event.target, headerRef.current)'
    )
    expect(source).toContain("document.body.style.overflow = 'hidden'")
    expect(source).toContain('setMobileOpen(false)')
    expect(source).toContain('key={pathname}')
    expect(source).toContain('onCloseMobileNav')
    expect(source).toContain('toggleRef.current?.focus()')
    expect(source).toContain('focus-visible:ring-2')
    expect(source).toContain('CLUB_MOBILE_NAV_MEDIA_QUERY')
  })
})
