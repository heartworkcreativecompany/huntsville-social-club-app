/**
 * Hostname classification for the dual-domain launch:
 *   huntsvillesocialclub.com          → marketing landing (+ public pages)
 *   members.huntsvillesocialclub.com  → member portal
 *   www.huntsvillesocialclub.com      → permanent redirect to apex (proxy only)
 *   *.vercel.app / localhost          → full app (preview / local)
 */

export type HostKind = 'marketing' | 'members' | 'www' | 'preview'

export const MARKETING_HOST = 'huntsvillesocialclub.com'
export const WWW_HOST = 'www.huntsvillesocialclub.com'
export const MEMBERS_HOST = 'members.huntsvillesocialclub.com'

/** Browser routes that stay on the marketing apex. */
export const MARKETING_BROWSER_ROUTES = [
  '/',
  '/pricing',
  '/privacy',
  '/terms',
  '/code-of-conduct',
  '/data-deletion',
] as const

export type RootRouteAction =
  | { type: 'landing' }
  | { type: 'redirect'; location: string }

export type ProxyHostAction =
  | { type: 'next' }
  | { type: 'redirect'; location: string; status: 307 | 308 }

function trimOrigin(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim().replace(/\/$/, '')
  return trimmed || undefined
}

function withHttps(hostOrUrl: string): string {
  const trimmed = hostOrUrl.trim().replace(/\/$/, '')
  if (/^https?:\/\//i.test(trimmed)) {
    if (
      /^http:\/\//i.test(trimmed) &&
      !/localhost|127\.0\.0\.1/i.test(trimmed)
    ) {
      return trimmed.replace(/^http:\/\//i, 'https://')
    }
    return trimmed
  }
  return `https://${trimmed}`
}

function withQuery(pathname: string, search = ''): string {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`
  const query = search && !search.startsWith('?') ? `?${search}` : search
  return `${path}${query}`
}

/** Strip port from a Host / X-Forwarded-Host value. */
export function normalizeHost(hostHeader: string): string {
  return hostHeader.split(',')[0]?.trim().split(':')[0]?.toLowerCase() ?? ''
}

export function normalizePathname(pathname: string): string {
  const path = pathname.split('?')[0] || '/'
  if (path.length > 1 && path.endsWith('/')) {
    return path.slice(0, -1)
  }
  return path || '/'
}

export function classifyHost(hostHeader: string): HostKind {
  const host = normalizeHost(hostHeader)
  if (host === WWW_HOST) return 'www'
  if (host === MARKETING_HOST) return 'marketing'
  if (host === MEMBERS_HOST) return 'members'
  return 'preview'
}

export function resolveRequestHost(headerStore: {
  get(name: string): string | null
}): string {
  return (
    headerStore.get('x-forwarded-host') ??
    headerStore.get('host') ??
    ''
  )
}

export function marketingOrigin(): string {
  return (
    trimOrigin(process.env.NEXT_PUBLIC_MARKETING_URL) ||
    `https://${MARKETING_HOST}`
  )
}

export function membersOrigin(): string {
  const fromEnv = trimOrigin(process.env.NEXT_PUBLIC_MEMBERS_URL)
  if (fromEnv) return withHttps(fromEnv)

  const appUrl = trimOrigin(process.env.NEXT_PUBLIC_APP_URL)
  if (appUrl) {
    try {
      const host = normalizeHost(new URL(withHttps(appUrl)).host)
      if (host === MEMBERS_HOST) return withHttps(appUrl)
    } catch {
      // fall through to default
    }
  }

  return `https://${MEMBERS_HOST}`
}

/**
 * Landing-page Sign in / Join hrefs.
 * Preview and local hosts keep the visitor on the current origin.
 * Production marketing continues to send portal CTAs to the members host.
 */
export function portalCtaHref(
  kind: HostKind,
  path: '/login' | '/signup'
): string {
  if (kind === 'preview') {
    return path
  }
  return `${membersOrigin()}${path}`
}

/**
 * Paths that must stay on the marketing host (or are infrastructure),
 * and therefore must not be redirected to the members portal.
 */
export function isMarketingPassthroughPath(pathname: string): boolean {
  const path = normalizePathname(pathname)

  if ((MARKETING_BROWSER_ROUTES as readonly string[]).includes(path)) {
    return true
  }

  if (isMarketingPublicEventsPath(path)) {
    return true
  }

  if (isMarketingInternalPublicEventsPath(path)) {
    return true
  }

  if (
    path === '/_next' ||
    path.startsWith('/_next/') ||
    path === '/api' ||
    path.startsWith('/api/') ||
    path === '/auth' ||
    path.startsWith('/auth/')
  ) {
    return true
  }

  // Static assets (favicon, robots, brand images, etc.)
  if (/\.[a-z0-9]+$/i.test(path)) {
    return true
  }

  return false
}

/**
 * Public calendar paths on the marketing host.
 * `/events` and `/events/:id` stay on huntsvillesocialclub.com.
 * One extra segment only, so member paths such as `/events/new/edit` are not included.
 */
export function isMarketingPublicEventsPath(pathname: string): boolean {
  return marketingPublicEventsInternalPath(pathname) !== null
}

/** Internal path the marketing `/events` rewrite targets. It must stay on the marketing host. */
export function isMarketingInternalPublicEventsPath(pathname: string): boolean {
  const path = normalizePathname(pathname)
  if (path === '/public-events') return true

  const match = /^\/public-events\/([^/]+)$/.exec(path)
  if (!match) return false
  const id = match[1]
  return Boolean(id && id !== '.' && id !== '..')
}

/** Internal App Router path for the public calendar. Route group names are not part of the URL. */
export function marketingPublicEventsInternalPath(pathname: string): string | null {
  const path = normalizePathname(pathname)
  if (path === '/events') return '/public-events'

  const match = /^\/events\/([^/]+)$/.exec(path)
  if (!match) return null

  const id = match[1]
  if (!id || id === '.' || id === '..') return null
  return `/public-events/${id}`
}

/**
 * Rewrite target for the proxy. Only the marketing host is rewritten.
 * The members host and preview hosts (localhost, *.vercel.app) keep `/events`
 * as the existing member calendar.
 */
export function proxyPublicEventsRewrite(
  kind: HostKind,
  pathname: string
): string | null {
  if (kind !== 'marketing') return null
  return marketingPublicEventsInternalPath(pathname)
}

/**
 * The public calendar is implemented at `/public-events` so it can be previewed
 * on localhost and *.vercel.app. On the members host that path is not a member
 * route, so send it to the existing member calendar instead of serving the
 * public page there.
 */
export function proxyMembersInternalPublicEventsRedirect(
  kind: HostKind,
  pathname: string,
  search = ''
): Extract<ProxyHostAction, { type: 'redirect' }> | null {
  if (kind !== 'members') return null

  const path = normalizePathname(pathname)
  if (path === '/public-events') {
    return {
      type: 'redirect',
      location: withQuery('/events', search),
      status: 307,
    }
  }

  const match = /^\/public-events\/([^/]+)$/.exec(path)
  if (!match) return null
  const id = match[1]
  if (!id || id === '.' || id === '..') return null

  return {
    type: 'redirect',
    location: withQuery(`/events/${id}`, search),
    status: 307,
  }
}

/** Members-host URL for a path that was requested on the marketing apex. */
export function membersRedirectUrl(pathname: string, search = ''): string {
  return `${membersOrigin()}${withQuery(pathname, search)}`
}

/**
 * Single place for hostname redirects used by proxy.ts.
 * www → apex is only configured here (not also in vercel.json).
 */
export function proxyHostAction(
  kind: HostKind,
  pathname: string,
  search = ''
): ProxyHostAction {
  if (kind === 'www') {
    return {
      type: 'redirect',
      location: wwwToApexRedirectUrl(pathname, search),
      status: 308,
    }
  }

  if (kind === 'marketing' && !isMarketingPassthroughPath(pathname)) {
    return {
      type: 'redirect',
      location: membersRedirectUrl(pathname, search),
      status: 307,
    }
  }

  return { type: 'next' }
}

/**
 * Decide what `/` should do for a classified hostname.
 * Members host never serves the marketing landing page.
 */
export function rootRouteAction(
  kind: HostKind,
  authenticated: boolean
): RootRouteAction {
  if (kind === 'members') {
    return {
      type: 'redirect',
      location: authenticated ? '/dashboard' : '/login',
    }
  }

  if (kind === 'www') {
    return {
      type: 'redirect',
      location: `${marketingOrigin()}/`,
    }
  }

  if (authenticated) {
    if (kind === 'marketing') {
      return {
        type: 'redirect',
        location: `${membersOrigin()}/dashboard`,
      }
    }
    return { type: 'redirect', location: '/dashboard' }
  }

  return { type: 'landing' }
}

/** Permanent redirect target for www → apex, preserving path + query. */
export function wwwToApexRedirectUrl(pathname: string, search = ''): string {
  return `${marketingOrigin()}${withQuery(pathname, search)}`
}
