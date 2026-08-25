'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import AuthPageShell from '@/components/auth/auth-page-shell'
import AuthStatusBanner from '@/components/auth/auth-status-banner'
import { createClient } from '@/lib/supabase/client'
import {
  friendlyAuthError,
  PASSWORD_UPDATED_SUCCESS,
} from '@/lib/auth-errors'
import {
  validatePassword,
  validatePasswordConfirmation,
} from '@/lib/auth-validation'
import {
  buttonPrimaryClassName,
  inputClassName,
  mobileFullButtonClassName,
} from '@/lib/event-labels'

export default function ResetPasswordPage() {
  const router = useRouter()
  const supabase = createClient()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!cancelled) {
        setSessionReady(Boolean(session))
        setCheckingSession(false)
      }
    }

    void checkSession()

    return () => {
      cancelled = true
    }
  }, [supabase.auth])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

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

    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setError(friendlyAuthError(updateError.message))
      setIsPending(false)
      return
    }

    await supabase.auth.signOut()
    setSuccess(true)
    setIsPending(false)
  }

  if (checkingSession) {
    return (
      <AuthPageShell
        eyebrow="Members"
        title="Set a new password"
        description="Loading your secure reset session…"
      >
        <p className="text-sm text-muted-foreground">One moment.</p>
      </AuthPageShell>
    )
  }

  if (!sessionReady) {
    return (
      <AuthPageShell
        eyebrow="Members"
        title="Reset link expired"
        description="Password reset links are single-use and expire after a short time."
        footer={
          <p className="text-center text-sm text-muted-foreground">
            <Link
              href="/login/forgot-password"
              className="font-medium text-accent underline"
            >
              Request a new reset link
            </Link>
          </p>
        }
      >
        <AuthStatusBanner variant="info" title="What to do next">
          Request a new password reset email, then open the latest link from
          your inbox.
        </AuthStatusBanner>
      </AuthPageShell>
    )
  }

  if (success) {
    return (
      <AuthPageShell
        eyebrow="Members"
        title="Password updated"
        description={PASSWORD_UPDATED_SUCCESS}
        footer={
          <p className="text-center text-sm text-muted-foreground">
            <Link href="/login" className="font-medium text-accent underline">
              Sign in
            </Link>
          </p>
        }
      >
        <AuthStatusBanner variant="success" title="You are all set">
          Your password has been changed. Sign in with your new password to
          continue.
        </AuthStatusBanner>
        <button
          type="button"
          className={`${buttonPrimaryClassName} ${mobileFullButtonClassName} mt-6`}
          onClick={() => router.push('/login?reset=success')}
        >
          Go to sign in
        </button>
      </AuthPageShell>
    )
  }

  return (
    <AuthPageShell
      eyebrow="Members"
      title="Set a new password"
      description="Choose a strong password for your Huntsville Social Club account."
      footer={
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-accent underline">
            Back to sign in
          </Link>
        </p>
      }
    >
      <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-foreground">New password</span>
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
          <p className="text-sm break-words text-danger" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          className={`${buttonPrimaryClassName} ${mobileFullButtonClassName}`}
          disabled={isPending}
        >
          {isPending ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </AuthPageShell>
  )
}
