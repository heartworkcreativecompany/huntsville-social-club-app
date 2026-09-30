/** Map Supabase auth errors to friendly copy without leaking account existence. */

export const INVALID_LOGIN_CREDENTIALS_MESSAGE =
  'Email or password is incorrect. Try again or use Forgot password.'

export const RECOVERY_LINK_INVALID_MESSAGE =
  'This reset link is invalid or has expired. Request a new password reset email and open the latest link.'

export const RECOVERY_BROWSER_MESSAGE =
  'Open the reset link in the same browser where you requested it, or request a new password reset email.'

export const PASSWORD_UPDATE_FAILED_MESSAGE =
  'Password could not be updated. Request a new reset link and try again.'

export const TEMPORARY_AUTH_PROBLEM_MESSAGE =
  'A temporary authentication problem occurred. Please try again.'

export function friendlyAuthError(message: string): string {
  const lower = message.toLowerCase()

  if (
    lower.includes('invalid login credentials') ||
    lower.includes('invalid email or password')
  ) {
    return INVALID_LOGIN_CREDENTIALS_MESSAGE
  }

  if (lower.includes('email not confirmed')) {
    return 'Confirm your email before signing in. Use Resend confirmation email below if you did not receive the link.'
  }

  if (lower.includes('user already registered')) {
    return 'An account with this email may already exist. Try signing in or reset your password.'
  }

  if (lower.includes('password should be at least')) {
    return 'Password must be at least 8 characters.'
  }

  if (lower.includes('signup requires a valid password')) {
    return 'Enter a valid password (at least 8 characters).'
  }

  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'Too many attempts. Please wait a few minutes and try again.'
  }

  if (
    lower.includes('code verifier') ||
    lower.includes('pkce') ||
    lower.includes('flow_state') ||
    lower.includes('invalid grant')
  ) {
    return RECOVERY_BROWSER_MESSAGE
  }

  if (
    lower.includes('otp_expired') ||
    lower.includes('email link is invalid') ||
    (lower.includes('session') &&
      (lower.includes('expired') || lower.includes('invalid'))) ||
    (lower.includes('expired') &&
      (lower.includes('otp') || lower.includes('link') || lower.includes('token')))
  ) {
    return RECOVERY_LINK_INVALID_MESSAGE
  }

  if (lower.includes('same password') || lower.includes('different from the old')) {
    return 'Choose a different password than your current one.'
  }

  if (
    lower.includes('network') ||
    lower.includes('fetch') ||
    lower.includes('timeout') ||
    lower.includes('internal server') ||
    lower.includes('service unavailable')
  ) {
    return TEMPORARY_AUTH_PROBLEM_MESSAGE
  }

  if (
    lower.includes('password') &&
    (lower.includes('update') || lower.includes('unable') || lower.includes('could not'))
  ) {
    return PASSWORD_UPDATE_FAILED_MESSAGE
  }

  return 'Something went wrong. Please try again.'
}

/** Generic copy for password reset request — never confirms whether an account exists. */
export const PASSWORD_RESET_REQUEST_SUCCESS =
  'If an account exists for that email, we sent a reset link. Check your inbox and spam folder.'

export const ACCOUNT_CREATED_SUCCESS =
  'Account created. Check your email to confirm your address, then sign in to start your membership application.'

export const EMAIL_CONFIRMED_SUCCESS = 'Email confirmed. You can now sign in.'

export const PASSWORD_UPDATED_SUCCESS =
  'Password updated. Sign in with your new password.'
