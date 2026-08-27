'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { friendlyAuthError } from '@/lib/auth-errors'
import { validateEmail } from '@/lib/auth-validation'
import { authCallbackUrl, SUPPORT_EMAIL } from '@/lib/site'
import { buttonSecondaryClassName, mobileFullButtonClassName } from '@/lib/event-labels'

const RESEND_SUCCESS =
  'If that email still needs confirmation, we sent a new link. Check inbox and spam.'

export function ResendConfirmationHelp() {
  return (
    <p className="mt-2 min-w-0 text-xs leading-relaxed break-words text-muted-foreground">
      Confirmation emails come from{' '}
      <a
        href={`mailto:${SUPPORT_EMAIL}`}
        className="link-brand break-all underline decoration-accent/70 underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {SUPPORT_EMAIL}
      </a>
      {'. If you still do not see the email, save this email address as a safe sender and then try again.'}
    </p>
  )
}

/**
 * Resends the Supabase Auth signup confirmation email (not Resend transactional mail).
 * Used by the Status page “Email verified” step when Auth has not confirmed yet.
 * Confirmation links always come from Supabase Auth / project SMTP.
 * emailRedirectTo must match an allow-listed Redirect URL in Supabase Auth.
 */
export default function ResendConfirmationEmail({
  email,
  className = '',
}: {
  /** Prefill from the sign-in form when available. */
  email: string
  className?: string
}) {
  const supabase = createClient()
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isPending, setIsPending] = useState(false)

  const handleResend = async () => {
    setMessage('')
    setError('')

    const emailError = validateEmail(email)
    if (emailError) {
      setError('Enter your email above, then resend confirmation.')
      return
    }

    setIsPending(true)
    const trimmed = email.trim()

    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email: trimmed,
      options: {
        emailRedirectTo: authCallbackUrl('/login?confirmed=1'),
      },
    })

    setIsPending(false)

    if (resendError) {
      setError(friendlyAuthError(resendError.message))
      return
    }

    // Do not reveal whether the account exists / needs confirmation.
    setMessage(RESEND_SUCCESS)
  }

  return (
    <div className={className}>
      <button
        type="button"
        className={`${buttonSecondaryClassName} ${mobileFullButtonClassName}`}
        disabled={isPending}
        onClick={() => void handleResend()}
      >
        {isPending ? 'Sending…' : 'Resend confirmation email'}
      </button>
      {error ? (
        <p className="mt-2 min-w-0 text-sm break-words text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mt-2 text-sm text-muted-foreground" role="status">
          {message}
        </p>
      ) : null}
      <ResendConfirmationHelp />
    </div>
  )
}
