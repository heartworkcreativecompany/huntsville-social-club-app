'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import AuthStatusBanner from '@/components/auth/auth-status-banner'
import { loginStatusFromSearch } from '@/lib/auth-callback'
import {
  EMAIL_CONFIRMED_SUCCESS,
  PASSWORD_UPDATED_SUCCESS,
  RECOVERY_BROWSER_MESSAGE,
  RECOVERY_LINK_INVALID_MESSAGE,
} from '@/lib/auth-errors'

export default function LoginStatusMessages() {
  const searchParams = useSearchParams()
  const status = loginStatusFromSearch({
    confirmed: searchParams.get('confirmed'),
    reset: searchParams.get('reset'),
    error: searchParams.get('error'),
  })

  if (status === 'confirmed') {
    return (
      <AuthStatusBanner variant="success" title="Email confirmed">
        {EMAIL_CONFIRMED_SUCCESS}
      </AuthStatusBanner>
    )
  }

  if (status === 'reset') {
    return (
      <AuthStatusBanner variant="success" title="Password updated">
        {PASSWORD_UPDATED_SUCCESS}
      </AuthStatusBanner>
    )
  }

  if (status === 'callback_failed') {
    return (
      <AuthStatusBanner variant="info" title="Link could not be verified">
        This confirmation or sign-in link may have expired. Sign in again, or use
        Resend confirmation email below if you still need to confirm your address.
      </AuthStatusBanner>
    )
  }

  if (status === 'recovery_link' || status === 'recovery_browser') {
    return (
      <AuthStatusBanner
        variant="info"
        title={
          status === 'recovery_browser'
            ? 'Open the link in the same browser'
            : 'Reset link unavailable'
        }
      >
        {status === 'recovery_browser'
          ? RECOVERY_BROWSER_MESSAGE
          : RECOVERY_LINK_INVALID_MESSAGE}{' '}
        <Link href="/login/forgot-password" className="font-medium text-accent underline">
          Request a new reset link
        </Link>
      </AuthStatusBanner>
    )
  }

  return null
}
