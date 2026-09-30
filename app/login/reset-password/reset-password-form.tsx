'use client'

import Link from 'next/link'
import { useState } from 'react'
import AuthPageShell from '@/components/auth/auth-page-shell'
import { updatePasswordFromRecovery } from '@/app/login/reset-password/actions'
import {
  validatePassword,
  validatePasswordConfirmation,
} from '@/lib/auth-validation'
import {
  buttonPrimaryClassName,
  inputClassName,
  mobileFullButtonClassName,
} from '@/lib/event-labels'

export default function ResetPasswordForm() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isPending, setIsPending] = useState(false)

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
    const result = await updatePasswordFromRecovery(password, confirmPassword)
    if (result?.error) {
      setError(result.error)
      setIsPending(false)
    }
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
