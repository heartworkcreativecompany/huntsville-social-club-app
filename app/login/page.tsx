'use client'

import Link from 'next/link'
import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AuthPageShell from '@/components/auth/auth-page-shell'
import LoginStatusMessages from '@/components/auth/login-status-messages'
import ResendConfirmationEmail from '@/components/auth/resend-confirmation-email'
import { createClient } from '@/lib/supabase/client'
import { postLoginPath } from '@/lib/auth-post-login'
import { safeUpgradeReturnPath } from '@/lib/membership-plan-links'
import { friendlyAuthError } from '@/lib/auth-errors'
import { validateEmail, validatePassword } from '@/lib/auth-validation'
import { trackEvent } from '@/lib/analytics'
import {
  buttonPrimaryClassName,
  inputClassName,
  mobileFullButtonClassName,
} from '@/lib/event-labels'

export default function SignInPage() {
  return (
    <AuthPageShell
      eyebrow="Members"
      title="Sign in"
      description="Sign in to see upcoming nights, your profile, and everything happening in the club."
      footer={
        <p className="text-center text-sm text-muted-foreground">
          Need an account?{' '}
          <Suspense fallback={<Link href="/signup" className="link-brand font-medium underline">Sign up</Link>}>
            <LoginSignupLink />
          </Suspense>
        </p>
      }
    >
      <Suspense fallback={null}>
        <LoginStatusMessages />
      </Suspense>
      <Suspense fallback={null}>
        <SignInForm />
      </Suspense>
    </AuthPageShell>
  )
}

function isEmailNotConfirmedError(message: string): boolean {
  return message.toLowerCase().includes('email not confirmed')
}

function LoginSignupLink() {
  const searchParams = useSearchParams()
  const returnPath = safeUpgradeReturnPath(searchParams.get('next'))
  const href = returnPath
    ? `/signup?next=${encodeURIComponent(returnPath)}`
    : '/signup'
  return (
    <Link href={href} className="link-brand font-medium underline">
      Sign up
    </Link>
  )
}

function SignInForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [needsConfirmation, setNeedsConfirmation] = useState(false)
  const [isPending, setIsPending] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setNeedsConfirmation(false)

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

    setIsPending(true)

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (signInError) {
      setError(friendlyAuthError(signInError.message))
      setNeedsConfirmation(isEmailNotConfirmedError(signInError.message))
      trackEvent('auth_sign_in_failed', { reason: 'credentials' })
      setIsPending(false)
      return
    }

    trackEvent('auth_sign_in')
    const fallback = await postLoginPath(supabase)
    const requested = safeUpgradeReturnPath(searchParams.get('next'))
    const path =
      fallback === '/application' ? fallback : (requested ?? fallback)
    router.push(path)
    router.refresh()
  }

  return (
    <form className="mt-6 grid gap-4" onSubmit={handleSubmit} noValidate>
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

      <div className="grid gap-1.5 text-sm">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <label htmlFor="password" className="font-medium text-foreground">
            Password
          </label>
          <Link
            href="/login/forgot-password"
            className="link-brand text-xs underline"
          >
            Forgot password?
          </Link>
        </div>
        <input
          id="password"
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClassName}
          disabled={isPending}
        />
      </div>

      {error ? (
        <p className="text-sm break-words text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        className={`${buttonPrimaryClassName} ${mobileFullButtonClassName}`}
        disabled={isPending}
      >
        {isPending ? 'Signing in…' : 'Sign in'}
      </button>

      {needsConfirmation ? (
        <ResendConfirmationEmail email={email} />
      ) : (
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer text-accent underline">
            Didn’t get a confirmation email?
          </summary>
          <div className="mt-3">
            <ResendConfirmationEmail email={email} />
          </div>
        </details>
      )}
    </form>
  )
}
