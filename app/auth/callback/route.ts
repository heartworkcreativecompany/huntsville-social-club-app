import { NextResponse } from 'next/server'
import { syncEmailApprovalGateForUser } from '@/lib/approval-gate-sync'
import {
  resolveAuthCallbackRedirect,
  toEmailOtpCallbackType,
} from '@/lib/auth-callback'
import { createClient } from '@/lib/supabase/server'

/**
 * Supabase Auth PKCE / email confirmation callback.
 * Redirect URLs in Supabase must allow this path on the same origin as
 * NEXT_PUBLIC_APP_URL (see lib/site.ts authCallbackUrl).
 * Email verified gate sync uses Auth `email_confirmed_at` as source of truth.
 *
 * Confirmation is often completed by Supabase's verify endpoint *before* this
 * app exchanges the one-time `code`. A missing verifier, email-client prefetch,
 * or a second GET must not show “Link could not be verified” if the address is
 * already confirmed or the code was simply already consumed.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const next = searchParams.get('next') ?? '/home'
  const type = searchParams.get('type')
  const providerAuthError = Boolean(
    searchParams.get('error') || searchParams.get('error_code')
  )

  const supabase = await createClient()
  const {
    data: { user: existingUser },
  } = await supabase.auth.getUser()

  let sessionUser = existingUser
  let exchangeError: string | null = null

  const alreadyConfirmed = Boolean(existingUser?.email_confirmed_at)

  if (code && !alreadyConfirmed) {
    const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(
      code
    )
    if (error) {
      exchangeError = error.message
      const {
        data: { user: afterErrorUser },
      } = await supabase.auth.getUser()
      sessionUser = afterErrorUser ?? sessionUser
    } else {
      sessionUser = sessionData.user ?? sessionUser
    }
  } else if (!code && tokenHash && !alreadyConfirmed) {
    const otpType = toEmailOtpCallbackType(type)
    if (!otpType) {
      exchangeError = 'expired'
    } else {
      const { data: otpData, error } = await supabase.auth.verifyOtp({
        type: otpType,
        token_hash: tokenHash,
      })
      if (error) {
        exchangeError = error.message
        const {
          data: { user: afterErrorUser },
        } = await supabase.auth.getUser()
        sessionUser = afterErrorUser ?? sessionUser
      } else {
        sessionUser = otpData.user ?? sessionUser
      }
    }
  }

  const destination = resolveAuthCallbackRedirect({
    next,
    type,
    hasCode: Boolean(code),
    hasTokenHash: Boolean(tokenHash),
    exchangeError,
    existingEmailConfirmed: Boolean(sessionUser?.email_confirmed_at),
    providerAuthError,
  })

  if (sessionUser?.email_confirmed_at) {
    await syncEmailApprovalGateForUser(supabase, sessionUser.id, true)
  }

  return NextResponse.redirect(`${origin}${destination}`)
}
