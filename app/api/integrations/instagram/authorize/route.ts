import { NextResponse } from 'next/server'
import {
  adminGateResponse,
  applyNoStore,
  requireInstagramSetupAdmin,
} from '@/lib/integrations/instagram-oauth-http'
import {
  INSTAGRAM_OAUTH_ENV,
  INSTAGRAM_OAUTH_STATE_COOKIE,
  INSTAGRAM_SETUP_SECRET_HEADER,
  buildInstagramAuthorizeUrl,
  createInstagramOauthState,
  instagramOauthStateCookieOptions,
  readInstagramOauthConfig,
  requestCarriesSetupSecretQuery,
  setupSecretFromHeader,
  setupSecretsMatch,
} from '@/lib/integrations/instagram-oauth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Operator-only starter. Send INSTAGRAM_OAUTH_SETUP_SECRET in the
 * x-hsc-instagram-setup-secret header. It is never accepted from the URL.
 */
export async function POST(request: Request) {
  const url = new URL(request.url)
  if (requestCarriesSetupSecretQuery(url)) {
    return applyNoStore(
      NextResponse.json({ error: 'Setup authorization was rejected.' }, { status: 400 })
    )
  }

  const admin = await requireInstagramSetupAdmin()
  if (!admin.ok) return adminGateResponse(admin.status)

  const configured = readInstagramOauthConfig()
  if ('missing' in configured) {
    return applyNoStore(
      NextResponse.json(
        { error: `Missing server configuration: ${configured.missing.join(', ')}` },
        { status: 503 }
      )
    )
  }

  const providedSecret = setupSecretFromHeader(
    request.headers.get(INSTAGRAM_SETUP_SECRET_HEADER)
  )
  if (
    !providedSecret ||
    !setupSecretsMatch(providedSecret, configured.config.setupSecret)
  ) {
    return applyNoStore(
      NextResponse.json({ error: 'Setup authorization was rejected.' }, { status: 403 })
    )
  }

  const issued = createInstagramOauthState({
    userId: admin.userId,
    setupSecret: configured.config.setupSecret,
  })
  if (!issued) {
    return applyNoStore(
      NextResponse.json({ error: 'Setup authorization was rejected.' }, { status: 403 })
    )
  }

  const destination = buildInstagramAuthorizeUrl({
    appId: configured.config.appId,
    redirectUri: configured.config.redirectUri,
    state: issued.state,
  })
  if (
    destination.includes(configured.config.appSecret) ||
    destination.includes(configured.config.setupSecret) ||
    destination.includes('client_secret')
  ) {
    return applyNoStore(
      NextResponse.json({ error: 'Setup authorization was rejected.' }, { status: 403 })
    )
  }

  const response = applyNoStore(NextResponse.redirect(destination, 303))
  response.cookies.set(
    INSTAGRAM_OAUTH_STATE_COOKIE,
    issued.cookieValue,
    instagramOauthStateCookieOptions()
  )
  return response
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  if (requestCarriesSetupSecretQuery(url)) {
    return applyNoStore(
      NextResponse.json({ error: 'Setup authorization was rejected.' }, { status: 400 })
    )
  }
  return applyNoStore(
    NextResponse.json(
      { error: `Use POST with the ${INSTAGRAM_OAUTH_ENV.setupSecret} header gate.` },
      { status: 405 }
    )
  )
}
