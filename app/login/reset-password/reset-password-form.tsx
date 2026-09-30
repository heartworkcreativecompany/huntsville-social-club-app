'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import AuthPageShell from '@/components/auth/auth-page-shell'
import { updatePasswordFromRecovery } from '@/app/login/reset-password/actions'
import {
  PASSWORD_REQUIREMENT_IDS,
  PASSWORD_REQUIREMENT_LABELS,
  preparePasswordResetSubmit,
  validatePasswordPolicy,
} from '@/lib/password-policy'
import {
  buttonPrimaryClassName,
  inputClassName,
  mobileFullButtonClassName,
} from '@/lib/event-labels'

export default function ResetPasswordForm() {
  const passwordRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLInputElement>(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [errorField, setErrorField] = useState<'password' | 'confirm' | null>(null)
  const [attemptedSubmit, setAttemptedSubmit] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const policy = validatePasswordPolicy(password)
  const passwordDescribedBy = errorField === 'password' && error
    ? 'new-password-requirements new-password-error'
    : 'new-password-requirements'

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setAttemptedSubmit(true)
    setError('')
    setErrorField(null)

    const decision = preparePasswordResetSubmit(password, confirmPassword)
    if (!decision.ok) {
      setError(decision.error)
      setErrorField(decision.field)
      const field = decision.field === 'password' ? passwordRef.current : confirmRef.current
      field?.focus()
      return
    }

    setIsPending(true)
    const result = await updatePasswordFromRecovery(password, confirmPassword)
    if (result?.error) {
      setError(result.error)
      setErrorField('password')
      setIsPending(false)
      passwordRef.current?.focus()
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
        <div className="grid gap-1.5 text-sm">
          <label className="grid gap-1.5" htmlFor="new-password">
            <span className="font-medium text-foreground">New password</span>
            <input
              ref={passwordRef}
              id="new-password"
              type="password"
              name="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={inputClassName}
              disabled={isPending}
              aria-describedby={passwordDescribedBy}
              aria-invalid={attemptedSubmit && !policy.valid}
              required
            />
          </label>
          <div id="new-password-requirements">
            <p id="new-password-requirements-label" className="text-xs font-medium text-foreground">
              Create a password with:
            </p>
            <ul
              aria-labelledby="new-password-requirements-label"
              className="mt-1.5 grid gap-1"
            >
              {PASSWORD_REQUIREMENT_IDS.map((requirement) => {
                const met = !policy.unmetRequirements.includes(requirement)
                const failed = attemptedSubmit && !met
                const stateLabel = met ? 'Met' : failed ? 'Needed' : 'Not yet met'
                return (
                  <li
                    key={requirement}
                    className={`text-xs ${
                      failed
                        ? 'text-danger'
                        : met
                          ? 'text-foreground'
                          : 'text-muted-foreground'
                    }`}
                  >
                    {stateLabel}: {PASSWORD_REQUIREMENT_LABELS[requirement]}
                  </li>
                )
              })}
            </ul>
          </div>
          {errorField === 'password' && error ? (
            <p id="new-password-error" className="text-sm break-words text-danger" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <label className="grid gap-1.5 text-sm" htmlFor="confirm-password">
          <span className="font-medium text-foreground">Confirm password</span>
          <input
            ref={confirmRef}
            id="confirm-password"
            type="password"
            name="confirmPassword"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className={inputClassName}
            disabled={isPending}
            aria-describedby={errorField === 'confirm' && error ? 'confirm-password-error' : undefined}
            aria-invalid={errorField === 'confirm' && Boolean(error)}
            required
          />
          {errorField === 'confirm' && error ? (
            <p id="confirm-password-error" className="text-sm break-words text-danger" role="alert">
              {error}
            </p>
          ) : null}
        </label>

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
