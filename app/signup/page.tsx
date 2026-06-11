'use client'

import Link from 'next/link'
import { useState } from 'react'
import AuthPageShell from '@/components/auth/auth-page-shell'
import AuthStatusBanner from '@/components/auth/auth-status-banner'
import { createClient } from '@/lib/supabase/client'
import {
  ACCOUNT_CREATED_SUCCESS,
  friendlyAuthError,
} from '@/lib/auth-errors'
import {
  validateEmail,
  validatePassword,
  validatePasswordConfirmation,
} from '@/lib/auth-validation'
import { authCallbackUrl } from '@/lib/site'
import { trackEvent } from '@/lib/analytics'
import { sendWelcomeEmail } from '@/lib/transactional-email'
import {
  buttonPrimaryClassName,
  inputClassName,
} from '@/lib/event-labels'

export default function SignUpPage() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
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

    const passwordError = validatePassword(password)
    if (passwordError) {
      setError(passwordError)
      return
    }

    const confirmError = validatePasswordConfirmation(password, confirmPassword)
    if (confirmError) {
      setError(confirmError)
      return
    }

    setIsPending(true)

    const trimmedEmail = email.trim()

    const { error: signUpError } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: {
        emailRedirectTo: authCallbackUrl('/login?confirmed=1'),
      },
    })

    if (signUpError) {
      setError(friendlyAuthError(signUpError.message))
      setIsPending(false)
      return
    }

    trackEvent('auth_account_created')
    void sendWelcomeEmail(trimmedEmail)
    setSuccess(true)
    setIsPending(false)
  }

  return (
    <AuthPageShell
      eyebrow="Membership"
      title="Create your account"
      description="Join Huntsville Social Club. After confirming your email, you can complete your membership application."
      footer={
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-accent underline">
            Sign in
          </Link>
        </p>
      }
    >
      {success ? (
        <AuthStatusBanner variant="success" title="Account created">
          {ACCOUNT_CREATED_SUCCESS}
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

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-foreground">Password</span>
            <input
              type="password"
              name="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClassName}
              disabled={isPending}
            />
            <span className="text-xs text-muted-foreground">
              At least 8 characters.
            </span>
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-foreground">Confirm password</span>
            <input
              type="password"
              name="confirmPassword"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
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
            {isPending ? 'Creating account…' : 'Create account'}
          </button>

          <p className="text-xs leading-relaxed text-muted-foreground">
            By creating an account you agree to our{' '}
            <Link href="/terms" className="text-accent underline">
              Terms
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="text-accent underline">
              Privacy Policy
            </Link>
            .
          </p>
        </form>
      )}
    </AuthPageShell>
  )
}
