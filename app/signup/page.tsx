'use client'

import Link from 'next/link'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  EMAIL_MARKETING_OPT_IN_LABEL,
  ESSENTIAL_EMAIL_ACKNOWLEDGEMENT_LABEL,
  ESSENTIAL_EMAIL_ACKNOWLEDGEMENT_REQUIRED_MESSAGE,
  signupEmailConsentMetadata,
} from '@/lib/email-consent'
import AuthPageShell from '@/components/auth/auth-page-shell'
import AuthStatusBanner from '@/components/auth/auth-status-banner'
import { createClient } from '@/lib/supabase/client'
import { accountCreatedSuccessMessage, isAuthEmailConfirmationRequired } from '@/lib/auth-email'
import {
  friendlyAuthError,
} from '@/lib/auth-errors'
import {
  validateEmail,
  validatePassword,
  validatePasswordConfirmation,
} from '@/lib/auth-validation'
import { authCallbackUrl } from '@/lib/site'
import { safeUpgradeReturnPath, loginHrefForReturnPath } from '@/lib/membership-plan-links'
import { trackEvent } from '@/lib/analytics'
import {
  trackApplicationLead,
  trackApplicationViewContent,
} from '@/lib/meta-pixel'
import {
  buttonPrimaryClassName,
  inputClassName,
  mobileFullButtonClassName,
} from '@/lib/event-labels'

export default function SignUpPage() {
  return (
    <Suspense fallback={null}>
      <SignUpForm />
    </Suspense>
  )
}

function SignUpForm() {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const returnPath = safeUpgradeReturnPath(searchParams.get('next'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const [essentialAcknowledged, setEssentialAcknowledged] = useState(false)
  const [marketingOptIn, setMarketingOptIn] = useState(false)

  useEffect(() => {
    trackApplicationViewContent()
  }, [])

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

    if (!essentialAcknowledged) {
      setError(ESSENTIAL_EMAIL_ACKNOWLEDGEMENT_REQUIRED_MESSAGE)
      return
    }

    setIsPending(true)

    const trimmedEmail = email.trim()

    const { error: signUpError } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: {
        emailRedirectTo: authCallbackUrl(returnPath ?? '/login?confirmed=1'),
        data: signupEmailConsentMetadata({
          essentialAcknowledged,
          marketingOptIn,
        }),
      },
    })

    if (signUpError) {
      setError(friendlyAuthError(signUpError.message))
      setIsPending(false)
      return
    }

    trackEvent('auth_account_created')
    trackApplicationLead()
    setSuccess(true)
    setIsPending(false)
  }

  return (
    <AuthPageShell
      eyebrow="Membership"
      title="Create your account"
      description={
        isAuthEmailConfirmationRequired()
          ? 'Create your account, confirm your email, and start your application to join the club.'
          : 'Create your account and start your application to join the club.'
      }
      footer={
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link
            href={returnPath ? loginHrefForReturnPath(returnPath) : '/login'}
            className="font-medium text-accent underline"
          >
            Sign in
          </Link>
        </p>
      }
    >
      {success ? (
        <AuthStatusBanner variant="success" title="Account created">
          {accountCreatedSuccessMessage()}
        </AuthStatusBanner>
      ) : (
        <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-foreground">Email</span>
            <input
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
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

          <div className="grid gap-3">
            <div className="flex min-h-11 gap-3 text-sm">
              <input
                id="essential-email-acknowledgement"
                name="essential_email_acknowledgement"
                type="checkbox"
                className="mt-1 h-5 w-5 shrink-0 rounded border-border"
                checked={essentialAcknowledged}
                onChange={(event) => setEssentialAcknowledged(event.target.checked)}
                disabled={isPending}
                required
              />
              <label
                htmlFor="essential-email-acknowledgement"
                className="min-w-0 text-sm leading-relaxed text-foreground"
              >
                {ESSENTIAL_EMAIL_ACKNOWLEDGEMENT_LABEL}
              </label>
            </div>
            <div className="flex min-h-11 gap-3 text-sm">
              <input
                id="email-marketing-opt-in"
                name="email_marketing_opt_in"
                type="checkbox"
                className="mt-1 h-5 w-5 shrink-0 rounded border-border"
                checked={marketingOptIn}
                onChange={(event) => setMarketingOptIn(event.target.checked)}
                disabled={isPending}
              />
              <label
                htmlFor="email-marketing-opt-in"
                className="min-w-0 text-sm leading-relaxed text-muted-foreground"
              >
                {EMAIL_MARKETING_OPT_IN_LABEL}
              </label>
            </div>
          </div>

          {error ? (
            <p className="text-sm break-words text-danger" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            className={`${buttonPrimaryClassName} ${mobileFullButtonClassName}`}
            disabled={isPending || !essentialAcknowledged}
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
