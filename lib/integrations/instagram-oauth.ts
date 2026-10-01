import 'server-only'

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/** Official Instagram Login authorization endpoint. Credentials stay out of this URL except the public app id. */
export const INSTAGRAM_AUTHORIZE_ENDPOINT = 'https://www.instagram.com/oauth/authorize'

/** Short-lived code exchange. Credentials are sent in the POST body, not the URL. */
export const INSTAGRAM_SHORT_LIVED_TOKEN_ENDPOINT =
  'https://api.instagram.com/oauth/access_token'

/** Long-lived token exchange. Credentials are sent in the POST body, not the URL. */
export const INSTAGRAM_LONG_LIVED_TOKEN_ENDPOINT =
  'https://graph.instagram.com/access_token'

export const INSTAGRAM_OAUTH_SCOPE = 'instagram_business_basic'
export const INSTAGRAM_OAUTH_STATE_COOKIE = 'hsc_instagram_oauth_state'
export const INSTAGRAM_OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60
export const INSTAGRAM_OAUTH_COOKIE_PATH = '/api/integrations/instagram'
export const INSTAGRAM_SETUP_SECRET_HEADER = 'x-hsc-instagram-setup-secret'

export const INSTAGRAM_OAUTH_ENV = {
  appId: 'INSTAGRAM_APP_ID',
  appSecret: 'INSTAGRAM_APP_SECRET',
  redirectUri: 'INSTAGRAM_OAUTH_REDIRECT_URI',
  setupSecret: 'INSTAGRAM_OAUTH_SETUP_SECRET',
} as const

const QUERY_SECRET_KEYS = new Set([
  'setupsecret',
  'setup_secret',
  'secret',
  'instagram_oauth_setup_secret',
  'instagram_app_secret',
  'instagram_access_token',
])

export type InstagramOauthConfig = {
  appId: string
  appSecret: string
  redirectUri: string
  setupSecret: string
}

export function readInstagramOauthConfig(
  env: NodeJS.ProcessEnv = process.env
): { config: InstagramOauthConfig } | { missing: string[] } {
  const pairs = [
    [INSTAGRAM_OAUTH_ENV.appId, env.INSTAGRAM_APP_ID],
    [INSTAGRAM_OAUTH_ENV.appSecret, env.INSTAGRAM_APP_SECRET],
    [INSTAGRAM_OAUTH_ENV.redirectUri, env.INSTAGRAM_OAUTH_REDIRECT_URI],
    [INSTAGRAM_OAUTH_ENV.setupSecret, env.INSTAGRAM_OAUTH_SETUP_SECRET],
  ] as const
  const missing = pairs.filter(([, value]) => !value?.trim()).map(([name]) => name)
  if (missing.length > 0) return { missing }
  return {
    config: {
      appId: env.INSTAGRAM_APP_ID!.trim(),
      appSecret: env.INSTAGRAM_APP_SECRET!.trim(),
      redirectUri: env.INSTAGRAM_OAUTH_REDIRECT_URI!.trim(),
      setupSecret: env.INSTAGRAM_OAUTH_SETUP_SECRET!.trim(),
    },
  }
}

export function requestCarriesSetupSecretQuery(url: URL): boolean {
  for (const key of url.searchParams.keys()) {
    if (QUERY_SECRET_KEYS.has(key.toLowerCase())) return true
  }
  return false
}

export function setupSecretFromHeader(headerValue: string | null): string | null {
  const value = headerValue?.trim() ?? ''
  return value || null
}

export function setupSecretsMatch(provided: string, expected: string): boolean {
  return safeEqual(provided, expected)
}

export function instagramOauthStateCookieOptions(nodeEnv = process.env.NODE_ENV): {
  httpOnly: true
  secure: boolean
  sameSite: 'lax'
  path: string
  maxAge: number
} {
  return {
    httpOnly: true,
    secure: nodeEnv === 'production',
    sameSite: 'lax',
    path: INSTAGRAM_OAUTH_COOKIE_PATH,
    maxAge: INSTAGRAM_OAUTH_STATE_MAX_AGE_SECONDS,
  }
}

export function createInstagramOauthState(input: {
  userId: string
  setupSecret: string
  nowMs?: number
}): { state: string; cookieValue: string } | null {
  if (!input.userId || !input.setupSecret) return null
  const state = randomBytes(32).toString('base64url')
  const nowMs = input.nowMs ?? Date.now()
  const exp = nowMs + INSTAGRAM_OAUTH_STATE_MAX_AGE_SECONDS * 1000
  const cookieValue = signStateCookie({
    state,
    exp,
    userId: input.userId,
    setupSecret: input.setupSecret,
  })
  return cookieValue ? { state, cookieValue } : null
}

export function verifyInstagramOauthState(input: {
  cookieValue: string | undefined
  returnedState: string | null
  userId: string
  setupSecret: string
  nowMs?: number
}): 'ok' | 'missing' | 'invalid' | 'expired' {
  if (!input.cookieValue) return 'missing'
  if (!input.returnedState || !input.userId || !input.setupSecret) return 'invalid'
  const parsed = parseStateCookie(input.cookieValue)
  if (!parsed) return 'invalid'
  const nowMs = input.nowMs ?? Date.now()
  if (!Number.isSafeInteger(parsed.exp) || parsed.exp <= nowMs) return 'expired'
  const expected = signStateCookie({
    state: parsed.state,
    exp: parsed.exp,
    userId: input.userId,
    setupSecret: input.setupSecret,
  })
  if (!expected || !safeEqual(expected, input.cookieValue)) return 'invalid'
  if (!safeEqual(parsed.state, input.returnedState)) return 'invalid'
  return 'ok'
}

export function buildInstagramAuthorizeUrl(input: {
  appId: string
  redirectUri: string
  state: string
}): string {
  const url = new URL(INSTAGRAM_AUTHORIZE_ENDPOINT)
  url.searchParams.set('client_id', input.appId)
  url.searchParams.set('redirect_uri', input.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', INSTAGRAM_OAUTH_SCOPE)
  url.searchParams.set('state', input.state)
  return url.toString()
}

export type InstagramLongLivedResult = {
  accessToken: string
  userId: string
  expiresIn: number
}

export async function exchangeInstagramAuthorizationCode(input: {
  code: string
  appId: string
  appSecret: string
  redirectUri: string
  fetchImpl?: typeof fetch
}): Promise<InstagramLongLivedResult | null> {
  const fetchImpl = input.fetchImpl ?? fetch
  const code = input.code.trim().replace(/#_$/, '')
  if (!code || !input.appId || !input.appSecret || !input.redirectUri) return null

  const shortLived = await postForm(fetchImpl, INSTAGRAM_SHORT_LIVED_TOKEN_ENDPOINT, {
    client_id: input.appId,
    client_secret: input.appSecret,
    grant_type: 'authorization_code',
    redirect_uri: input.redirectUri,
    code,
  })
  const shortToken = readToken(shortLived)
  const userId = readUserId(shortLived)
  if (!shortToken || !userId) return null

  const longLived = await postForm(fetchImpl, INSTAGRAM_LONG_LIVED_TOKEN_ENDPOINT, {
    grant_type: 'ig_exchange_token',
    client_secret: input.appSecret,
    access_token: shortToken,
  })
  const accessToken = readToken(longLived)
  const expiresIn = readExpiresIn(longLived)
  if (!accessToken || expiresIn === null) return null
  return { accessToken, userId, expiresIn }
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function signStateCookie(input: {
  state: string
  exp: number
  userId: string
  setupSecret: string
}): string | null {
  if (!input.setupSecret || !input.state || !input.userId) return null
  const payload = `${input.state}.${input.exp}.${input.userId}`
  const signature = createHmac('sha256', input.setupSecret).update(payload).digest('base64url')
  return `${input.state}.${input.exp}.${signature}`
}

function parseStateCookie(
  value: string
): { state: string; exp: number } | null {
  const parts = value.split('.')
  if (parts.length !== 3) return null
  const [state, expRaw] = parts
  if (!state || !expRaw || !/^\d+$/.test(expRaw)) return null
  const exp = Number(expRaw)
  if (!Number.isSafeInteger(exp)) return null
  return { state, exp }
}

function safeEqual(left: string, right: string): boolean {
  const a = createHmac('sha256', 'hsc-instagram-oauth-compare').update(left).digest()
  const b = createHmac('sha256', 'hsc-instagram-oauth-compare').update(right).digest()
  return timingSafeEqual(a, b)
}

async function postForm(
  fetchImpl: typeof fetch,
  endpoint: string,
  fields: Record<string, string>
): Promise<unknown> {
  const body = new URLSearchParams(fields)
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body,
    cache: 'no-store',
  })
  if (!response.ok) return null
  return response.json().catch(() => null)
}

function readToken(payload: unknown): string | null {
  const record = firstRecord(payload)
  const token = record?.access_token
  return typeof token === 'string' && token.trim() ? token.trim() : null
}

function readUserId(payload: unknown): string | null {
  const record = firstRecord(payload)
  const userId = record?.user_id
  if (typeof userId === 'string' && userId.trim()) return userId.trim()
  if (typeof userId === 'number' && Number.isSafeInteger(userId)) return String(userId)
  return null
}

function readExpiresIn(payload: unknown): number | null {
  const record = firstRecord(payload)
  const expires = record?.expires_in
  if (typeof expires === 'number' && Number.isFinite(expires) && expires > 0) {
    return Math.floor(expires)
  }
  if (typeof expires === 'string' && /^\d+$/.test(expires)) {
    const parsed = Number(expires)
    return parsed > 0 ? parsed : null
  }
  return null
}

function firstRecord(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  const data = record.data
  if (Array.isArray(data) && data[0] && typeof data[0] === 'object') {
    return data[0] as Record<string, unknown>
  }
  return record
}
