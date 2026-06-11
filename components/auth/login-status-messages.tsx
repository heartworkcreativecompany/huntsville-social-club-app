'use client'

import { useSearchParams } from 'next/navigation'
import AuthStatusBanner from '@/components/auth/auth-status-banner'
import {
  EMAIL_CONFIRMED_SUCCESS,
  PASSWORD_UPDATED_SUCCESS,
} from '@/lib/auth-errors'

export default function LoginStatusMessages() {
  const searchParams = useSearchParams()
  const confirmed = searchParams.get('confirmed')
  const reset = searchParams.get('reset')
  const error = searchParams.get('error')

  if (confirmed === '1') {
    return (
      <AuthStatusBanner variant="success" title="Email confirmed">
        {EMAIL_CONFIRMED_SUCCESS}
      </AuthStatusBanner>
    )
  }

  if (reset === 'success') {
    return (
      <AuthStatusBanner variant="success" title="Password updated">
        {PASSWORD_UPDATED_SUCCESS}
      </AuthStatusBanner>
    )
  }

  if (error === 'auth_callback_failed') {
    return (
      <AuthStatusBanner variant="info" title="Link could not be verified">
        This sign-in or confirmation link may have expired. Try signing in, or
        request a new password reset if needed.
      </AuthStatusBanner>
    )
  }

  return null
}
