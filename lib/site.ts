export const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'hello@huntsvillesocialclub.com'

export function appOrigin(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }
  return 'http://localhost:3000'
}

export function authCallbackUrl(next: string): string {
  const path = next.startsWith('/') ? next : `/${next}`
  return `${appOrigin()}/auth/callback?next=${encodeURIComponent(path)}`
}
