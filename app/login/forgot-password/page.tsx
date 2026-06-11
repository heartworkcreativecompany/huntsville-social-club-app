'use client'

import Link from 'next/link'
import { useState } from 'react'
import AuthPageShell from '@/components/auth/auth-page-shell'
import AuthStatusBanner from '@/components/auth/auth-status-banner'
import { createClient } from '@/lib/supabase/client'
import {
  friendlyAuthError,
  PASSWORD_RESET_REQUEST_SUCCESS,
} from '@/lib/auth-errors'
import { validateEmail } from '@/lib/auth-validation'
import { authCallbackUrl } from '@/lib/site'
import {
  buttonPrimaryClassName,
  inputClassName,
} from '@/lib/event-labels'

export default function ForgotPasswordPage() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [isPending, setIsPending] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess(false)

    const emailError = validateEmail(email)
    if (emailError) {
      setError(emailError)
      return
    }

    setIsPending(true)

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo: authCallbackUrl('/login/reset-password') }
    )

    if (resetError) {
      setError(friendlyAuthError(resetError.message))
      setIsPending(false)
      return
    }

    setSuccess(true)
    setIsPending(false)
  }

  return (
    <AuthPageShell
      eyebrow="Members"
      title="Reset your password"
      description="Enter the email on your account and we will send a reset link."
      footer={
        <p className="text-center text-sm text-muted-foreground">
          Remember your password?{' '}
          <Link href="/login" className="font-medium text-accent underline">
            Sign in
          </Link>
        </p>
      }
    >
      {success ? (
        <AuthStatusBanner variant="success" title="Check your email">
          {PASSWORD_RESET_REQUEST_SUCCESS}
        </AuthStatusBanner>
      ) : (
        <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-foreground">Email</span>
            <input
              type="email"
              name="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClassName}
              disabled={isPending}
            />
          </label>

          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            className={buttonPrimaryClassName}
            disabled={isPending}
          >
            {isPending ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}
    </AuthPageShell>
  )
}
