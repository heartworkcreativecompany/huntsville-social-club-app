import { NextResponse } from 'next/server'
import { syncEmailApprovalGateForUser } from '@/lib/approval-gate-sync'
import {
  RECOVERY_LINK_INVALID_PATH,
  RECOVERY_LOGIN_PATH,
  isRecoveryCallback,
  resolveAuthCallbackRedirect,
  safeAuthCallbackNext,
  shouldExchangeAuthCode,
  shouldVerifyAuthTokenHash,
  toEmailOtpCallbackType,
} from '@/lib/auth-callback'
import { paidPlanFromSafeNext } from '@/lib/membership-plan-links'
import {
  PASSWORD_RECOVERY_COOKIE,
  createPasswordRecoveryMarker,
  passwordRecoveryCookieOptions,
  passwordRecoverySecret,
} from '@/lib/password-recovery'
import { setPendingMembershipPlanOnResponse } from '@/lib/pending-membership-plan'
import { createClient } from '@/lib/supabase/server'

/**
 * Supabase Auth PKCE / email confirmation callback.
 * Redirect URLs in Supabase must allow this path on the same origin as
 * NEXT_PUBLIC_APP_URL (see lib/site.ts authCallbackUrl).
 * Email verified gate sync uses Auth `email_confirmed_at` as source of truth.
 *
 * A callback `code` is always exchanged before the redirect is chosen. An
 * existing confirmed session must not skip that exchange, or a password
 * recovery link would authorize the already signed-in account.
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
  const recoveryAttempt = isRecoveryCallback(type, safeAuthCallbackNext(next))

  const supabase = await createClient()

  let sessionUser: { id: string; email_confirmed_at?: string | null } | null = null
  let exchangeError: string | null = null

  if (code && shouldExchangeAuthCode(code)) {
    const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(
      code
    )
    if (error) {
      exchangeError = error.message
    } else {
      sessionUser = sessionData.user ?? null
    }
  } else if (tokenHash && shouldVerifyAuthTokenHash(code, tokenHash)) {
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
      } else {
        sessionUser = otpData.user ?? null
      }
    }
  }

  if (!sessionUser) {
    const {
      data: { user: fallbackUser },
    } = await supabase.auth.getUser()
    sessionUser = fallbackUser
  }

  let destination = resolveAuthCallbackRedirect({
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

  let recoveryMarker: string | null = null
  if (
    recoveryAttempt &&
    !exchangeError &&
    sessionUser?.id &&
    destination === RECOVERY_LOGIN_PATH
  ) {
    recoveryMarker = await createPasswordRecoveryMarker(
      sessionUser.id,
      passwordRecoverySecret()
    )
    if (!recoveryMarker) {
      destination = RECOVERY_LINK_INVALID_PATH
    }
  }

  const redirectResponse = NextResponse.redirect(`${origin}${destination}`)
  if (recoveryAttempt) {
    if (recoveryMarker) {
      redirectResponse.cookies.set(
        PASSWORD_RECOVERY_COOKIE,
        recoveryMarker,
        passwordRecoveryCookieOptions()
      )
    } else {
      redirectResponse.cookies.set(
        PASSWORD_RECOVERY_COOKIE,
        '',
        passwordRecoveryCookieOptions(0)
      )
    }
  }

  const pendingPlan = paidPlanFromSafeNext(next)
  if (pendingPlan) {
    setPendingMembershipPlanOnResponse(redirectResponse, pendingPlan)
  }
  return redirectResponse
}
