/**
 * Canonical public origin for auth redirects, Stripe return URLs, and absolute links.
 *
 * Production / Vercel: set NEXT_PUBLIC_APP_URL to the canonical HTTPS origin
 * (e.g. https://app.huntsvillesocialclub.com). Supabase Auth → URL Configuration
 * must use the same Site URL and allow Redirect URLs that match
 * `{NEXT_PUBLIC_APP_URL}/auth/callback` (and query variants).
 *
 * Local: defaults to http://localhost:3000 when unset.
 * Never silently emit localhost when NODE_ENV=production or VERCEL is set.
 */
export const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'hello@huntsvillesocialclub.com'

function isDeployedRuntime(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL === '1' ||
    Boolean(process.env.VERCEL_ENV)
  )
}

export function appOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '')
  if (configured) {
    if (
      isDeployedRuntime() &&
      /localhost|127\.0\.0\.1/i.test(configured)
    ) {
      throw new Error(
        'NEXT_PUBLIC_APP_URL must not point at localhost in a deployed environment. Set it to your public HTTPS origin and mirror that origin in Supabase Auth URL Configuration.'
      )
    }
    return configured
  }

  if (process.env.VERCEL_URL) {
    // Preview/deploy fallback — prefer setting NEXT_PUBLIC_APP_URL to a stable domain.
    return `https://${process.env.VERCEL_URL.replace(/\/$/, '')}`
  }

  if (isDeployedRuntime()) {
    throw new Error(
      'NEXT_PUBLIC_APP_URL is required in production so auth confirmation and Stripe return URLs are not localhost. Set it in the host environment and add the matching Redirect URL in Supabase Auth.'
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
