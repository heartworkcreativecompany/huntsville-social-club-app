/** Map Supabase auth errors to friendly copy without leaking account existence. */

export function friendlyAuthError(message: string): string {
  const lower = message.toLowerCase()

  if (
    lower.includes('invalid login credentials') ||
    lower.includes('invalid email or password')
  ) {
    return 'Email or password is incorrect. Try again or use Forgot password.'
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
    lower.includes('session') &&
    (lower.includes('expired') || lower.includes('invalid'))
  ) {
    return 'This link has expired. Request a new password reset email.'
  }

  if (lower.includes('same password')) {
    return 'Choose a different password than your current one.'
  }

  if (lower.includes('network') || lower.includes('fetch')) {
    return 'Connection problem. Check your network and try again.'
  }

  return 'Something went wrong. Please try again.'
}

/** Generic copy for password reset request — never confirms whether an account exists. */
export const PASSWORD_RESET_REQUEST_SUCCESS =
  'If an account exists for that email, we sent a reset link. Check your inbox and spam folder.'

export const ACCOUNT_CREATED_SUCCESS =
  'Account created. Check your email to confirm your address, then sign in to start your membership application.'

export const EMAIL_CONFIRMED_SUCCESS =
  'Email confirmed. Sign in to continue your membership application.'

export const PASSWORD_UPDATED_SUCCESS =
  'Password updated. Sign in with your new password.'
