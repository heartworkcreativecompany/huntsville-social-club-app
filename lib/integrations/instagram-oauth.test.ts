import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as authorizeGet, POST as authorizePost } from '@/app/api/integrations/instagram/authorize/route'
import { GET as callbackGet } from '@/app/api/integrations/instagram/callback/route'
import {
  INSTAGRAM_AUTHORIZE_ENDPOINT,
  INSTAGRAM_LONG_LIVED_TOKEN_ENDPOINT,
  INSTAGRAM_OAUTH_SCOPE,
  INSTAGRAM_OAUTH_STATE_COOKIE,
  INSTAGRAM_SETUP_SECRET_HEADER,
  INSTAGRAM_SHORT_LIVED_TOKEN_ENDPOINT,
  buildInstagramAuthorizeUrl,
  createInstagramOauthState,
  exchangeInstagramAuthorizationCode,
  instagramOauthStateCookieOptions,
  verifyInstagramOauthState,
} from '@/lib/integrations/instagram-oauth'

const { getUser, maybeSingle } = vi.hoisted(() => ({
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle }),
      }),
    }),
  })),
}))

const APP_ID = 'test-app-id'
const APP_SECRET = 'test-app-secret'
const SETUP_SECRET = 'test-setup-secret'
const REDIRECT_URI =
  'https://members.huntsvillesocialclub.com/api/integrations/instagram/callback'
const ADMIN_ID = 'admin-user'
const LONG_TOKEN = 'long-lived-test-token'
const SHORT_TOKEN = 'short-lived-test-token'
const USER_ID = 'ig-user-test'
const AUTH_CODE = 'one-time-test-code'

function asAdmin() {
  getUser.mockResolvedValue({ data: { user: { id: ADMIN_ID } } })
  maybeSingle.mockResolvedValue({ data: { role: 'admin' } })
}

function authorizeRequest(input?: {
  secret?: string | null
  query?: string
  method?: 'POST' | 'GET'
}) {
  const query = input?.query ? `?${input.query}` : ''
  const headers = new Headers()
  if (input?.secret) headers.set(INSTAGRAM_SETUP_SECRET_HEADER, input.secret)
  return new NextRequest(
    `http://localhost/api/integrations/instagram/authorize${query}`,
    { method: input?.method ?? 'POST', headers }
  )
}

describe('instagram oauth setup helper', () => {
  const originalFetch = globalThis.fetch
  const logs: string[] = []

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.INSTAGRAM_APP_ID = APP_ID
    process.env.INSTAGRAM_APP_SECRET = APP_SECRET
    process.env.INSTAGRAM_OAUTH_REDIRECT_URI = REDIRECT_URI
    process.env.INSTAGRAM_OAUTH_SETUP_SECRET = SETUP_SECRET
    asAdmin()
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '))
    })
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '))
    })
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
    logs.length = 0
  })

  it('rejects signed-out and non-admin callers', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const signedOut = await authorizePost(
      authorizeRequest({ secret: SETUP_SECRET })
    )
    expect(signedOut.status).toBe(401)
    expect(await signedOut.json()).toEqual({ error: 'You must be signed in.' })

    getUser.mockResolvedValue({ data: { user: { id: 'member-1' } } })
    maybeSingle.mockResolvedValue({ data: { role: 'member' } })
    const member = await authorizePost(authorizeRequest({ secret: SETUP_SECRET }))
    expect(member.status).toBe(403)
    expect(await member.json()).toEqual({ error: 'Administrator access required.' })
  })

  it('rejects a missing or incorrect setup secret and never accepts it from the query', async () => {
    const missing = await authorizePost(authorizeRequest())
    expect(missing.status).toBe(403)
    expect(JSON.stringify(await missing.json())).not.toContain(SETUP_SECRET)

    const wrong = await authorizePost(authorizeRequest({ secret: 'wrong-setup-secret' }))
    expect(wrong.status).toBe(403)
    const wrongBody = await wrong.json()
    expect(wrongBody.error).toBe('Setup authorization was rejected.')
    expect(JSON.stringify(wrongBody)).not.toContain('wrong-setup-secret')

    const fromQuery = await authorizePost(
      authorizeRequest({
        secret: SETUP_SECRET,
        query: `setupSecret=${encodeURIComponent(SETUP_SECRET)}`,
      })
    )
    expect(fromQuery.status).toBe(400)
    expect(fromQuery.headers.get('location')).toBeNull()
    expect(JSON.stringify(await fromQuery.json())).not.toContain(SETUP_SECRET)

    const bodyOnly = new NextRequest(
      'http://localhost/api/integrations/instagram/authorize',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ setupSecret: SETUP_SECRET }),
      }
    )
    const fromBody = await authorizePost(bodyOnly)
    expect(fromBody.status).toBe(403)
    expect(JSON.stringify(await fromBody.json())).not.toContain(SETUP_SECRET)

    const getStart = await authorizeGet(authorizeRequest({ method: 'GET' }))
    expect(getStart.status).toBe(405)
    expect(getStart.headers.get('location')).toBeNull()
    expect(getStart.headers.get('cache-control')).toContain('no-store')
  })

  it('names missing configuration without revealing configured values', async () => {
    delete process.env.INSTAGRAM_APP_SECRET
    const response = await authorizePost(authorizeRequest({ secret: SETUP_SECRET }))
    const body = await response.json()
    expect(response.status).toBe(503)
    expect(body.error).toBe('Missing server configuration: INSTAGRAM_APP_SECRET')
    expect(body.error).not.toContain(APP_ID)
    expect(body.error).not.toContain(SETUP_SECRET)
    expect(response.headers.get('cache-control')).toContain('no-store')
  })

  it('sets a short-lived httpOnly state cookie and redirects without the app secret', async () => {
    const response = await authorizePost(authorizeRequest({ secret: SETUP_SECRET }))
    expect(response.status).toBe(303)
    expect(response.headers.get('cache-control')).toContain('no-store')

    const location = response.headers.get('location') ?? ''
    const destination = new URL(location)
    expect(destination.origin + destination.pathname).toBe(INSTAGRAM_AUTHORIZE_ENDPOINT)
    expect(destination.searchParams.get('response_type')).toBe('code')
    expect(destination.searchParams.get('scope')).toBe(INSTAGRAM_OAUTH_SCOPE)
    expect(destination.searchParams.get('client_id')).toBe(APP_ID)
    expect(destination.searchParams.get('redirect_uri')).toBe(REDIRECT_URI)
    const state = destination.searchParams.get('state') ?? ''
    expect(state.length).toBeGreaterThanOrEqual(43)
    expect(destination.searchParams.get('client_secret')).toBeNull()
    expect(location).not.toContain(APP_SECRET)
    expect(location).not.toContain(SETUP_SECRET)

    const setCookie = response.headers.getSetCookie().join('\n')
    expect(setCookie).toContain(`${INSTAGRAM_OAUTH_STATE_COOKIE}=`)
    expect(setCookie.toLowerCase()).toContain('httponly')
    expect(setCookie.toLowerCase()).toContain('samesite=lax')
    expect(setCookie).toContain('Max-Age=600')
    expect(setCookie).toContain('Path=/api/integrations/instagram')
    expect(instagramOauthStateCookieOptions('production').secure).toBe(true)
    expect(instagramOauthStateCookieOptions('test').secure).toBe(false)
    expect(setCookie).not.toContain(APP_SECRET)
    expect(setCookie).not.toContain(SETUP_SECRET)

    const again = buildInstagramAuthorizeUrl({
      appId: APP_ID,
      redirectUri: REDIRECT_URI,
      state: 'another-state',
    })
    expect(again).not.toContain(APP_SECRET)
    expect(logs.join('\n')).not.toContain(state)
  })

  it('fails closed on callback state problems and clears the cookie', async () => {
    const issued = createInstagramOauthState({
      userId: ADMIN_ID,
      setupSecret: SETUP_SECRET,
      nowMs: Date.now(),
    })
    expect(issued).not.toBeNull()

    const cases = [
      callbackRequest({ state: 'different-state', cookie: issued!.cookieValue }),
      callbackRequest({ state: issued!.state }),
      callbackRequest({
        state: issued!.state,
        cookie: createInstagramOauthState({
          userId: ADMIN_ID,
          setupSecret: SETUP_SECRET,
          nowMs: Date.now() - 11 * 60 * 1000,
        })!.cookieValue,
      }),
      callbackRequest({ state: issued!.state, cookie: 'not-a-valid-cookie' }),
      callbackRequest({
        state: issued!.state,
        cookie: issued!.cookieValue,
        error: 'access_denied',
        errorDescription: 'RAW_PROVIDER_DETAIL',
      }),
    ]

    for (const request of cases) {
      const response = await callbackGet(request)
      expect(response.status).toBe(400)
      const html = await response.text()
      expect(html).toContain('could not be completed')
      expect(html).not.toContain(AUTH_CODE)
      expect(html).not.toContain(APP_SECRET)
      expect(html).not.toContain(SETUP_SECRET)
      expect(html).not.toContain('RAW_PROVIDER_DETAIL')
      expect(html).not.toContain(issued!.state)
      expect(response.headers.get('cache-control')).toContain('no-store')
      const cleared = response.headers.getSetCookie().join('\n')
      expect(cleared).toContain(`${INSTAGRAM_OAUTH_STATE_COOKIE}=`)
      expect(cleared).toContain('Max-Age=0')
    }

    expect(
      verifyInstagramOauthState({
        cookieValue: undefined,
        returnedState: issued!.state,
        userId: ADMIN_ID,
        setupSecret: SETUP_SECRET,
      })
    ).toBe('missing')

    getUser.mockResolvedValue({ data: { user: null } })
    const signedOut = await callbackGet(
      callbackRequest({ state: issued!.state, cookie: issued!.cookieValue, code: AUTH_CODE })
    )
    expect(signedOut.status).toBe(401)
    expect(JSON.stringify(await signedOut.json())).not.toContain(AUTH_CODE)
    expect(signedOut.headers.getSetCookie().join('\n')).toContain('Max-Age=0')

    asAdmin()
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ error_message: 'RAW_META_FAILURE' }), {
        status: 400,
      })
    }) as unknown as typeof fetch
    const providerFailure = await callbackGet(
      callbackRequest({
        state: issued!.state,
        cookie: issued!.cookieValue,
        code: AUTH_CODE,
      })
    )
    const failureHtml = await providerFailure.text()
    expect(providerFailure.status).toBe(400)
    expect(failureHtml).not.toContain('RAW_META_FAILURE')
    expect(failureHtml).not.toContain(AUTH_CODE)
    expect(failureHtml).not.toContain(APP_SECRET)
    expect(logs.join('\n')).not.toContain('RAW_META_FAILURE')
  })

  it('shows only the long-lived token result from mocked server-side exchanges', async () => {
    const issued = createInstagramOauthState({
      userId: ADMIN_ID,
      setupSecret: SETUP_SECRET,
    })!
    const fetchImpl = vi.fn(async (endpoint: string | URL) => {
      const url = String(endpoint)
      expect(url).not.toContain(APP_SECRET)
      expect(url).not.toContain(SHORT_TOKEN)
      expect(url).not.toContain(LONG_TOKEN)
      expect(url).not.toContain('?')
      if (url === INSTAGRAM_SHORT_LIVED_TOKEN_ENDPOINT) {
        return jsonResponse({ access_token: SHORT_TOKEN, user_id: USER_ID })
      }
      if (url === INSTAGRAM_LONG_LIVED_TOKEN_ENDPOINT) {
        return jsonResponse({ access_token: LONG_TOKEN, expires_in: 5184000 })
      }
      throw new Error('unexpected endpoint')
    })
    globalThis.fetch = fetchImpl as unknown as typeof fetch

    const response = await callbackGet(
      callbackRequest({
        state: issued.state,
        cookie: issued.cookieValue,
        code: AUTH_CODE,
      })
    )
    const html = await response.text()

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(html).toContain('INSTAGRAM_USER_ID')
    expect(html).toContain('INSTAGRAM_ACCESS_TOKEN')
    expect(html).toContain(USER_ID)
    expect(html).toContain(LONG_TOKEN)
    expect(html).toContain('5184000')
    expect(html).toContain('disable or remove this setup flow')
    expect(html).not.toContain(SHORT_TOKEN)
    expect(html).not.toContain(AUTH_CODE)
    expect(html).not.toContain(APP_SECRET)
    expect(html).not.toContain(SETUP_SECRET)
    expect(html).not.toContain(issued.state)
    expect(response.headers.get('location')).toBeNull()
    expect(logs.join('\n')).not.toContain(LONG_TOKEN)
    expect(logs.join('\n')).not.toContain(SHORT_TOKEN)

    const direct = await exchangeInstagramAuthorizationCode({
      code: AUTH_CODE,
      appId: APP_ID,
      appSecret: APP_SECRET,
      redirectUri: REDIRECT_URI,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(direct?.accessToken).toBe(LONG_TOKEN)
    expect(globalThis.fetch).toBe(fetchImpl)
  })
})

function callbackRequest(input: {
  state?: string
  cookie?: string
  code?: string
  error?: string
  errorDescription?: string
}) {
  const url = new URL('http://localhost/api/integrations/instagram/callback')
  if (input.state) url.searchParams.set('state', input.state)
  if (input.code) url.searchParams.set('code', input.code)
  if (input.error) url.searchParams.set('error', input.error)
  if (input.errorDescription) {
    url.searchParams.set('error_description', input.errorDescription)
  }
  const headers = new Headers()
  if (input.cookie) {
    headers.set('cookie', `${INSTAGRAM_OAUTH_STATE_COOKIE}=${input.cookie}`)
  }
  return new NextRequest(url, { headers })
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
