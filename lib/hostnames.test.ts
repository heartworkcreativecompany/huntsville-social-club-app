import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  classifyHost,
  isMarketingPassthroughPath,
  marketingOrigin,
  membersOrigin,
  membersRedirectUrl,
  normalizeHost,
  proxyHostAction,
  resolveRequestHost,
  rootRouteAction,
  wwwToApexRedirectUrl,
} from '@/lib/hostnames'

const ORIGINAL = { ...process.env }
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

afterEach(() => {
  process.env = { ...ORIGINAL }
})

describe('classifyHost', () => {
  it('classifies production custom domains', () => {
    expect(classifyHost('members.huntsvillesocialclub.com')).toBe('members')
    expect(classifyHost('huntsvillesocialclub.com')).toBe('marketing')
    expect(classifyHost('www.huntsvillesocialclub.com')).toBe('www')
  })

  it('treats vercel preview and localhost as full-app preview hosts', () => {
    expect(classifyHost('huntsville-social-club-8n04fj8qe.vercel.app')).toBe(
      'preview'
    )
    expect(classifyHost('huntsville-social-club-app.vercel.app')).toBe(
      'preview'
    )
    expect(classifyHost('localhost:3000')).toBe('preview')
    expect(classifyHost('127.0.0.1')).toBe('preview')
  })

  it('normalizes port and forwarded host lists', () => {
    expect(normalizeHost('members.huntsvillesocialclub.com:443')).toBe(
      'members.huntsvillesocialclub.com'
    )
    expect(
      classifyHost('www.huntsvillesocialclub.com, huntsvillesocialclub.com')
    ).toBe('www')
  })
})

describe('rootRouteAction — members host `/`', () => {
  it('redirects unauthenticated visitors to /login', () => {
    expect(rootRouteAction('members', false)).toEqual({
      type: 'redirect',
      location: '/login',
    })
  })

  it('redirects authenticated visitors to /members', () => {
    expect(rootRouteAction('members', true)).toEqual({
      type: 'redirect',
      location: '/members',
    })
  })
})

describe('rootRouteAction — marketing apex `/`', () => {
  it('serves the landing page when unauthenticated', () => {
    expect(rootRouteAction('marketing', false)).toEqual({ type: 'landing' })
  })

  it('sends authenticated visitors to the members portal', () => {
    delete process.env.NEXT_PUBLIC_MEMBERS_URL
    delete process.env.NEXT_PUBLIC_APP_URL
    expect(rootRouteAction('marketing', true)).toEqual({
      type: 'redirect',
      location: 'https://members.huntsvillesocialclub.com/members',
    })
  })
})

describe('rootRouteAction — preview hosts', () => {
  it('keeps existing vercel.app behavior (landing when signed out)', () => {
    expect(rootRouteAction('preview', false)).toEqual({ type: 'landing' })
  })

  it('keeps existing vercel.app behavior (members when signed in)', () => {
    expect(rootRouteAction('preview', true)).toEqual({
      type: 'redirect',
      location: '/members',
    })
  })
})

describe('marketing apex route gate', () => {
  it('keeps public marketing browser routes on apex', () => {
    for (const path of [
      '/',
      '/pricing',
      '/privacy',
      '/terms',
      '/code-of-conduct',
    ]) {
      expect(isMarketingPassthroughPath(path)).toBe(true)
      expect(proxyHostAction('marketing', path)).toEqual({ type: 'next' })
    }
  })

  it('redirects portal browser routes to members with query preserved', () => {
    delete process.env.NEXT_PUBLIC_MEMBERS_URL
    delete process.env.NEXT_PUBLIC_APP_URL

    const cases = [
      ['/login', '?next=%2Fmembers'],
      ['/signup', '?ref=cta'],
      ['/members', '?tab=directory'],
      ['/events', '?when=upcoming'],
    ] as const

    for (const [path, search] of cases) {
      expect(isMarketingPassthroughPath(path)).toBe(false)
      expect(proxyHostAction('marketing', path, search)).toEqual({
        type: 'redirect',
        location: `https://members.huntsvillesocialclub.com${path}${search}`,
        status: 307,
      })
      expect(membersRedirectUrl(path, search)).toBe(
        `https://members.huntsvillesocialclub.com${path}${search}`
      )
    }
  })

  it('does not redirect API, auth, webhook, cron, or static asset paths', () => {
    for (const path of [
      '/api/stripe/webhook',
      '/api/cron/curated-matches',
      '/api/stripe/identity/session',
      '/auth/callback',
      '/_next/static/chunks/main.js',
      '/_next/image',
      '/favicon.ico',
      '/brand/hsc-hero-lounge.jpg',
      '/robots.txt',
    ]) {
      expect(isMarketingPassthroughPath(path)).toBe(true)
      expect(proxyHostAction('marketing', path, '?x=1')).toEqual({
        type: 'next',
      })
    }
  })

  it('does not gate members or preview hosts', () => {
    expect(proxyHostAction('members', '/login')).toEqual({ type: 'next' })
    expect(proxyHostAction('preview', '/events', '?q=1')).toEqual({
      type: 'next',
    })
  })
})

describe('www → apex redirect (proxy only, exactly once)', () => {
  it('permanently targets apex while preserving path and query', () => {
    delete process.env.NEXT_PUBLIC_MARKETING_URL
    expect(wwwToApexRedirectUrl('/', '')).toBe(
      'https://huntsvillesocialclub.com/'
    )
    expect(wwwToApexRedirectUrl('/pricing', '?ref=nav')).toBe(
      'https://huntsvillesocialclub.com/pricing?ref=nav'
    )
    expect(wwwToApexRedirectUrl('/events/abc', 'utm=1')).toBe(
      'https://huntsvillesocialclub.com/events/abc?utm=1'
    )
  })

  it('is emitted by proxyHostAction as a single 308', () => {
    delete process.env.NEXT_PUBLIC_MARKETING_URL
    expect(proxyHostAction('www', '/pricing', '?ref=nav')).toEqual({
      type: 'redirect',
      location: 'https://huntsvillesocialclub.com/pricing?ref=nav',
      status: 308,
    })
  })

  it('is not duplicated in vercel.json', () => {
    const vercel = JSON.parse(
      readFileSync(join(REPO_ROOT, 'vercel.json'), 'utf8')
    ) as Record<string, unknown>
    expect(vercel.redirects).toBeUndefined()
  })
})

describe('membersOrigin / marketingOrigin', () => {
  it('defaults to production hosts', () => {
    delete process.env.NEXT_PUBLIC_MEMBERS_URL
    delete process.env.NEXT_PUBLIC_MARKETING_URL
    delete process.env.NEXT_PUBLIC_APP_URL
    expect(membersOrigin()).toBe('https://members.huntsvillesocialclub.com')
    expect(marketingOrigin()).toBe('https://huntsvillesocialclub.com')
  })

  it('prefers explicit env overrides', () => {
    process.env.NEXT_PUBLIC_MEMBERS_URL =
      'https://members.huntsvillesocialclub.com/'
    process.env.NEXT_PUBLIC_MARKETING_URL = 'https://huntsvillesocialclub.com/'
    expect(membersOrigin()).toBe('https://members.huntsvillesocialclub.com')
    expect(marketingOrigin()).toBe('https://huntsvillesocialclub.com')
  })

  it('uses NEXT_PUBLIC_APP_URL when it is the members host', () => {
    delete process.env.NEXT_PUBLIC_MEMBERS_URL
    process.env.NEXT_PUBLIC_APP_URL =
      'https://members.huntsvillesocialclub.com'
    expect(membersOrigin()).toBe('https://members.huntsvillesocialclub.com')
  })
})

describe('resolveRequestHost', () => {
  it('prefers x-forwarded-host over host', () => {
    const headers = new Headers({
      host: 'huntsvillesocialclub.com',
      'x-forwarded-host': 'members.huntsvillesocialclub.com',
    })
    expect(resolveRequestHost(headers)).toBe(
      'members.huntsvillesocialclub.com'
    )
  })
})
