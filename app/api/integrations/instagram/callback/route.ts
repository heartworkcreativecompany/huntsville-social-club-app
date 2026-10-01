import {
  adminGateResponse,
  clearInstagramOauthStateCookie,
  operatorHtml,
  requireInstagramSetupAdmin,
} from '@/lib/integrations/instagram-oauth-http'
import {
  INSTAGRAM_OAUTH_STATE_COOKIE,
  escapeHtml,
  exchangeInstagramAuthorizationCode,
  readInstagramOauthConfig,
  requestCarriesSetupSecretQuery,
  verifyInstagramOauthState,
} from '@/lib/integrations/instagram-oauth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const GENERIC_FAILURE =
  'Instagram authorization could not be completed. Start the setup again from the administrator session.'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const admin = await requireInstagramSetupAdmin()
  if (!admin.ok) {
    const response = adminGateResponse(admin.status)
    clearInstagramOauthStateCookie(response)
    return response
  }

  if (requestCarriesSetupSecretQuery(url)) {
    return fail()
  }

  const configured = readInstagramOauthConfig()
  if ('missing' in configured) {
    const response = operatorHtml(
      'Instagram setup',
      `<p>Missing server configuration: ${escapeHtml(configured.missing.join(', '))}.</p>`,
      503
    )
    clearInstagramOauthStateCookie(response)
    return response
  }

  const cookieValue = readCookie(request, INSTAGRAM_OAUTH_STATE_COOKIE)
  const returnedState = url.searchParams.get('state')
  const stateStatus = verifyInstagramOauthState({
    cookieValue,
    returnedState,
    userId: admin.userId,
    setupSecret: configured.config.setupSecret,
  })
  if (stateStatus !== 'ok') return fail()

  if (url.searchParams.has('error')) return fail()

  const code = url.searchParams.get('code')
  if (!code?.trim()) return fail()

  let exchanged: Awaited<ReturnType<typeof exchangeInstagramAuthorizationCode>>
  try {
    exchanged = await exchangeInstagramAuthorizationCode({
      code,
      appId: configured.config.appId,
      appSecret: configured.config.appSecret,
      redirectUri: configured.config.redirectUri,
    })
  } catch {
    return fail()
  }
  if (!exchanged) return fail()

  const response = operatorHtml(
    'Instagram setup',
    `<h1>Instagram setup result</h1>
<p>Copy only these two values into Vercel server environment variables. The application does not store them.</p>
<dl>
  <dt>INSTAGRAM_USER_ID</dt>
  <dd><code>${escapeHtml(exchanged.userId)}</code></dd>
  <dt>INSTAGRAM_ACCESS_TOKEN</dt>
  <dd><code>${escapeHtml(exchanged.accessToken)}</code></dd>
  <dt>Expires in seconds</dt>
  <dd>${escapeHtml(String(exchanged.expiresIn))}</dd>
</dl>
<p>After the values are saved in Vercel, disable or remove this setup flow.</p>`
  )
  clearInstagramOauthStateCookie(response)
  return response
}

function fail() {
  const response = operatorHtml(
    'Instagram setup',
    `<p>${GENERIC_FAILURE}</p>`,
    400
  )
  clearInstagramOauthStateCookie(response)
  return response
}

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie')
  if (!header) return undefined
  for (const part of header.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=')
    if (rawName === name) return decodeURIComponent(rawValue.join('='))
  }
  return undefined
}
