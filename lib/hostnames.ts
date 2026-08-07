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
 * Paths that must stay on the marketing host (or are infrastructure),
 * and therefore must not be redirected to the members portal.
 */
export function isMarketingPassthroughPath(pathname: string): boolean {
  const path = normalizePathname(pathname)

  if ((MARKETING_BROWSER_ROUTES as readonly string[]).includes(path)) {
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
      location: authenticated ? '/members' : '/login',
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
        location: `${membersOrigin()}/members`,
      }
    }
    return { type: 'redirect', location: '/members' }
  }

  return { type: 'landing' }
}

/** Permanent redirect target for www → apex, preserving path + query. */
export function wwwToApexRedirectUrl(pathname: string, search = ''): string {
  return `${marketingOrigin()}${withQuery(pathname, search)}`
}
