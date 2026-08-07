/**
 * Canonical public origin for auth redirects, Stripe return URLs, and absolute links.
 *
 * Production (VERCEL_ENV=production):
 *   Prefer NEXT_PUBLIC_APP_URL (canonical production domain).
 *   For the dual-domain launch this should be the members portal origin
 *   (https://members.huntsvillesocialclub.com), not the marketing apex.
 *   Fallbacks: SITE_URL, APP_URL, then VERCEL_PROJECT_PRODUCTION_URL.
 *   Never use VERCEL_URL (that is the ephemeral per-deployment host).
 *
 * Preview:
 *   Prefer NEXT_PUBLIC_APP_URL if set; otherwise VERCEL_URL is OK for testing.
 *
 * Local: defaults to http://localhost:3000 when unset.
 *
 * Hostname routing (marketing vs members vs www) lives in lib/hostnames.ts.
 */
export const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'hello@huntsvillesocialclub.com'

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

function isVercelProduction(): boolean {
  return process.env.VERCEL_ENV === 'production'
}

function isDeployedRuntime(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL === '1' ||
    Boolean(process.env.VERCEL_ENV)
  )
}

/**
 * Ephemeral Vercel deployment hosts look like:
 *   project-abc123xyz.vercel.app
 *   project-git-branch-team.vercel.app
 * Stable production aliases look like:
 *   project.vercel.app
 *   custom.domain.com
 */
export function isEphemeralVercelDeploymentHost(originOrHost: string): boolean {
  const host = originOrHost
    .replace(/^https?:\/\//i, '')
    .replace(/\/$/, '')
    .toLowerCase()

  if (!host.endsWith('.vercel.app')) return false

  const subdomain = host.slice(0, -'.vercel.app'.length)
  if (subdomain.includes('-git-')) return true

  const parts = subdomain.split('-')
  const last = parts[parts.length - 1] ?? ''
  // Deployment ID-style suffix (e.g. huntsville-social-club-8n04fj8qe)
  if (/^[a-z0-9]{8,14}$/i.test(last) && parts.length >= 2) {
    return true
  }
  return false
}

function configuredAppOrigin(): string | undefined {
  return (
    trimOrigin(process.env.NEXT_PUBLIC_APP_URL) ||
    trimOrigin(process.env.SITE_URL) ||
    trimOrigin(process.env.APP_URL)
  )
}

function productionFallbackOrigin(): string | undefined {
  const productionHost = trimOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL)
  if (!productionHost) return undefined
  const origin = withHttps(productionHost)
  if (isEphemeralVercelDeploymentHost(origin)) return undefined
  return origin
}

export function appOrigin(): string {
  const configured = configuredAppOrigin()

  if (configured) {
    if (isDeployedRuntime() && /localhost|127\.0\.0\.1/i.test(configured)) {
      throw new Error(
        'NEXT_PUBLIC_APP_URL must not point at localhost in a deployed environment. Set it to your public HTTPS origin and mirror that origin in Supabase Auth URL Configuration.'
      )
    }

    // Production must never redirect Stripe/auth to a one-off deployment URL.
    if (
      isVercelProduction() &&
      isEphemeralVercelDeploymentHost(configured)
    ) {
      const productionFallback = productionFallbackOrigin()
      if (productionFallback) {
        return productionFallback
      }
      throw new Error(
        'NEXT_PUBLIC_APP_URL points at an ephemeral Vercel deployment URL. Set it to the canonical production domain (e.g. https://huntsville-social-club-app.vercel.app or your custom domain).'
      )
    }

    return withHttps(configured)
  }

  // Production: never fall back to VERCEL_URL (per-deployment host).
  if (isVercelProduction()) {
    const productionFallback = productionFallbackOrigin()
    if (productionFallback) {
      return productionFallback
    }
    throw new Error(
      'NEXT_PUBLIC_APP_URL is required in production so Stripe return URLs and auth redirects use the canonical domain (not a preview deployment URL). Set NEXT_PUBLIC_APP_URL=https://huntsville-social-club-app.vercel.app (or your custom domain).'
    )
  }

  // Preview / other deployed non-production: deployment URL is acceptable.
  const vercelUrl = trimOrigin(process.env.VERCEL_URL)
  if (vercelUrl) {
    return withHttps(vercelUrl)
  }

  if (isDeployedRuntime()) {
    throw new Error(
      'NEXT_PUBLIC_APP_URL is required in this deployed environment so auth confirmation and Stripe return URLs are not localhost. Set it in the host environment and add the matching Redirect URL in Supabase Auth.'
    )
  }

  return 'http://localhost:3000'
}

/**
 * Supabase Auth emailRedirectTo / redirectTo target.
 * Must be allow-listed under Authentication → URL Configuration → Redirect URLs.
 */
export function authCallbackUrl(next: string): string {
  const path = next.startsWith('/') ? next : `/${next}`
  return `${appOrigin()}/auth/callback?next=${encodeURIComponent(path)}`
}
