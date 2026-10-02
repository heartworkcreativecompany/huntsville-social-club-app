import 'server-only'

import { NextResponse } from 'next/server'
import { MEMBER_PROFILES_VIEW } from '@/lib/member-profiles-view'
import { createClient } from '@/lib/supabase/server'
import {
  INSTAGRAM_OAUTH_COOKIE_PATH,
  INSTAGRAM_OAUTH_STATE_COOKIE,
  instagramOauthStateCookieOptions,
} from '@/lib/integrations/instagram-oauth'

export function applyNoStore(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store, no-cache, max-age=0, private')
  response.headers.set('Pragma', 'no-cache')
  response.headers.set('Expires', '0')
  response.headers.set('Referrer-Policy', 'no-referrer')
  return response
}

export function clearInstagramOauthStateCookie(response: NextResponse): void {
  response.cookies.set(INSTAGRAM_OAUTH_STATE_COOKIE, '', {
    ...instagramOauthStateCookieOptions(),
    path: INSTAGRAM_OAUTH_COOKIE_PATH,
    maxAge: 0,
  })
}

export async function requireInstagramSetupAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; status: 401 | 403 }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, status: 401 }

  const { data: profile } = await supabase
    .from(MEMBER_PROFILES_VIEW)
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.role !== 'admin') return { ok: false, status: 403 }
  return { ok: true, userId: user.id }
}

export function adminGateResponse(status: 401 | 403): NextResponse {
  const error =
    status === 401 ? 'You must be signed in.' : 'Administrator access required.'
  return applyNoStore(NextResponse.json({ error }, { status }))
}

export function operatorHtml(title: string, body: string, status = 200): NextResponse {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="robots" content="noindex" />
  <title>${title}</title>
</head>
<body>
${body}
<script>history.replaceState(null, "", location.pathname)</script>
</body>
</html>`
  return applyNoStore(
    new NextResponse(html, {
      status,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  )
}
