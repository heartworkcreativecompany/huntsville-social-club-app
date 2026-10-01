import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import AuthPageShell, { PUBLIC_HOME_URL } from '@/components/auth/auth-page-shell'
import ResetPasswordForm from '@/app/login/reset-password/reset-password-form'
import { ClubNavMarkup } from '@/components/shell/club-nav'
import { buildClubNavItems, clubLogoHref } from '@/lib/club-nav-items'

vi.mock('@/components/shell/notifications-bell', () => ({
  default: function NotificationsBellStub() {
    return createElement('div', { 'data-notifications-bell': 'true' })
  },
}))

const PUBLIC_HOME = 'https://huntsvillesocialclub.com'
const repoRoot = join(__dirname, '../..')

const AUTH_ROUTE_FILES = [
  'components/auth/auth-page-shell.tsx',
  'app/login/page.tsx',
  'app/signup/page.tsx',
  'app/login/forgot-password/page.tsx',
  'app/login/reset-password/page.tsx',
  'app/login/reset-password/reset-password-form.tsx',
]

function hrefsForLabel(html: string, label: string): string[] {
  const hrefs: string[] = []
  const anchor = /<a\b([^>]*)>([\s\S]*?)<\/a>/g
  for (const match of html.matchAll(anchor)) {
    const attrs = match[1] ?? ''
    const text = (match[2] ?? '').replace(/<[^>]+>/g, '')
    if (!text.includes(label)) continue
    const href = attrs.match(/\bhref="([^"]*)"/)?.[1]
    if (href) hrefs.push(href)
  }
  return hrefs
}

function logoHrefs(html: string): string[] {
  const hrefs: string[] = []
  const anchor = /<a\b([^>]*)>([\s\S]*?)<\/a>/g
  for (const match of html.matchAll(anchor)) {
    const attrs = match[1] ?? ''
    const inner = match[2] ?? ''
    if (!inner.includes('alt="Huntsville Social Club"')) continue
    const href = attrs.match(/\bhref="([^"]*)"/)?.[1]
    if (href) hrefs.push(href)
  }
  return hrefs
}

describe('member public-home links', () => {
  it('uses the exact public marketing homepage', () => {
    expect(PUBLIC_HOME_URL).toBe(PUBLIC_HOME)
  })

  it('points the auth header logo and Back to public home at the public site', () => {
    const html = renderToStaticMarkup(
      createElement(
        AuthPageShell,
        {
          title: 'Sign in',
          description: 'Members sign in here.',
        },
        null
      )
    )

    expect(logoHrefs(html)).toEqual([PUBLIC_HOME])
    expect(hrefsForLabel(html, 'Back to public home')).toEqual([PUBLIC_HOME])
    expect(html).not.toContain('href="/"')
    expect(html).not.toContain("href='/'")
  })

  it('keeps the reset-password public-home links absolute and sign-in internal', () => {
    const html = renderToStaticMarkup(createElement(ResetPasswordForm))

    expect(logoHrefs(html)).toEqual([PUBLIC_HOME])
    expect(hrefsForLabel(html, 'Back to public home')).toEqual([PUBLIC_HOME])
    expect(hrefsForLabel(html, 'Back to sign in')).toEqual(['/login'])
    expect(html).not.toContain('href="/"')
  })

  it('does not leave a relative public-home href on unauthenticated auth screens', () => {
    const combined = AUTH_ROUTE_FILES.map((file) =>
      readFileSync(join(repoRoot, file), 'utf8')
    ).join('\n')

    expect(combined).toContain('Back to public home')
    expect(combined.match(/Back to public home/g)).toHaveLength(1)
    expect(combined).not.toMatch(/href=\{\s*['"]\/['"]\s*\}/)
    expect(combined).not.toMatch(/href=['"]\/['"]/)
    expect(combined).toContain(PUBLIC_HOME)
  })
})

describe('member app navigation stays internal', () => {
  it('keeps the club header logo and nav on member routes', () => {
    const items = buildClubNavItems({
      role: 'member',
      canAccessApp: true,
      applicationStatus: 'approved',
      showMatchesNav: false,
    })

    expect(clubLogoHref(true)).toBe('/dashboard')
    expect(clubLogoHref(false)).toBe('/application')
    expect(items.map((item) => item.href)).toEqual([
      '/dashboard',
      '/members',
      '/events',
      '/business',
      '/messages',
      '/profile',
    ])

    const html = renderToStaticMarkup(
      createElement(ClubNavMarkup, {
        items,
        logoHref: clubLogoHref(true),
        pathname: '/dashboard',
        mobileOpen: false,
        notifications: [],
        unreadNotificationCount: 0,
        onToggleMobileNav: () => undefined,
        onCloseMobileNav: () => undefined,
      })
    )

    expect(logoHrefs(html)).toEqual(['/dashboard'])
    expect(html).toContain('href="/members"')
    expect(html).toContain('href="/events"')
    expect(html).not.toContain(PUBLIC_HOME)
  })
})
