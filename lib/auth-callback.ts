/**
 * Auth callback destination logic (PKCE code exchange + email OTP).
 * Presentation only — does not change token verification, allowlists, or expiry.
 */

export const AUTH_CALLBACK_FAILED_PARAM = 'auth_callback_failed'
export const EMAIL_CONFIRMED_LOGIN_PATH = '/login?confirmed=1'
export const AUTH_CALLBACK_FAILED_LOGIN_PATH = `/login?error=${AUTH_CALLBACK_FAILED_PARAM}`
export const RECOVERY_LOGIN_PATH = '/login/reset-password'

const EMAIL_OTP_TYPES = [
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
] as const

export type EmailOtpCallbackType = (typeof EMAIL_OTP_TYPES)[number]

export function safeAuthCallbackNext(next: string | null | undefined): string {
  const value = next?.trim() || '/home'
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return '/home'
  }
  return value
}

export function isConfirmationCallbackNext(next: string): boolean {
  const path = safeAuthCallbackNext(next)
  try {
    return new URL(path, 'http://hsc.invalid').searchParams.get('confirmed') === '1'
  } catch {
    return /(?:^|[?&])confirmed=1(?:&|$)/.test(path)
  }
}

export function isRecoveryCallback(type: string | null | undefined, next: string): boolean {
  if (type === 'recovery') return true
  return safeAuthCallbackNext(next).includes('reset-password')
}

export function toEmailOtpCallbackType(
  type: string | null | undefined
): EmailOtpCallbackType | null {
  if (!type) return null
  return EMAIL_OTP_TYPES.includes(type as EmailOtpCallbackType)
    ? (type as EmailOtpCallbackType)
    : null
}

/**
 * PKCE/code replay vs a genuinely expired or invalid email link.
 * Matching is case-insensitive on the provider message only — never shown in UI.
 */
export function classifyAuthExchangeFailure(
  message: string | null | undefined
): 'consumed_or_replay' | 'expired_or_invalid' {
  const lower = (message ?? '').toLowerCase()

  const consumed =
    lower.includes('flow_state') ||
    lower.includes('code verifier') ||
    lower.includes('pkce') ||
    lower.includes('already been used') ||
    lower.includes('already used') ||
    lower.includes('invalid flow') ||
    lower.includes('invalid grant') ||
    (lower.includes('auth code') && lower.includes('verifier'))

  const expired =
    lower.includes('otp_expired') ||
    lower.includes('email link is invalid') ||
    (lower.includes('expired') &&
      (lower.includes('otp') || lower.includes('link') || lower.includes('token')))

  if (consumed) return 'consumed_or_replay'
  if (expired) return 'expired_or_invalid'
  return 'expired_or_invalid'
}

export function resolveAuthCallbackRedirect(input: {
  next: string | null
  type: string | null
  hasCode: boolean
  hasTokenHash: boolean
  exchangeError: string | null
  existingEmailConfirmed: boolean
  providerAuthError?: boolean
}): string {
  const next = safeAuthCallbackNext(input.next)
  const recovery = isRecoveryCallback(input.type, next)
  const confirmation = isConfirmationCallbackNext(next)

  const successPath = recovery ? RECOVERY_LOGIN_PATH : next

  if (input.existingEmailConfirmed) {
    if (confirmation) return EMAIL_CONFIRMED_LOGIN_PATH
    return successPath
  }

  if (input.providerAuthError && !input.hasCode && !input.hasTokenHash) {
    return AUTH_CALLBACK_FAILED_LOGIN_PATH
  }

  if (!input.hasCode && !input.hasTokenHash) {
    if (recovery) return AUTH_CALLBACK_FAILED_LOGIN_PATH
    if (confirmation) return EMAIL_CONFIRMED_LOGIN_PATH
    return successPath
  }

  if (input.exchangeError) {
    const kind = classifyAuthExchangeFailure(input.exchangeError)
    if (kind === 'consumed_or_replay' && confirmation) {
      return EMAIL_CONFIRMED_LOGIN_PATH
    }
    return AUTH_CALLBACK_FAILED_LOGIN_PATH
  }

  if (confirmation) return EMAIL_CONFIRMED_LOGIN_PATH
  return successPath
}

export type LoginStatusKind = 'confirmed' | 'reset' | 'callback_failed' | 'none'

/** `confirmed=1` wins over a stale callback error so a replay cannot show failure. */
export function loginStatusFromSearch(input: {
  confirmed: string | null
  reset: string | null
  error: string | null
}): LoginStatusKind {
  if (input.confirmed === '1') return 'confirmed'
  if (input.reset === 'success') return 'reset'
  if (input.error === AUTH_CALLBACK_FAILED_PARAM) return 'callback_failed'
  return 'none'
}

export function authCallbackRedirectExposesSecrets(path: string): boolean {
  const lower = path.toLowerCase()
  return (
    lower.includes('access_token') ||
    lower.includes('refresh_token') ||
    lower.includes('token_hash') ||
    /(?:^|[?&])code=/.test(lower) ||
    lower.includes('id_token')
  )
}
