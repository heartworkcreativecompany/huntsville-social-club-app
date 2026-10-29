'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Card from '@/components/ui/card'
import { saveEmailMarketingPreference } from '@/app/(club)/members/email-marketing-actions'
import { revealProfileSection } from '@/components/profile/profile-section'
import {
  ACCOUNT_EMAIL_MARKETING_OPT_IN_EXPLANATION,
  ACCOUNT_EMAIL_MARKETING_OPT_IN_LABEL,
  displayedMarketingOptIn,
  EMAIL_MARKETING_PREFERENCE_SAVED,
  EMAIL_MARKETING_PREFERENCE_UNAVAILABLE,
  EMAIL_MARKETING_RESUBSCRIPTION_BLOCKED,
  emailMarketingPreferencePhase,
  type EmailMarketingPreferencePhase,
  type EmailMarketingPreferenceResult,
} from '@/lib/email-marketing-preference'
import { SUPPORT_EMAIL } from '@/lib/site'
import { buttonPrimaryClassName, mobileFullButtonClassName } from '@/lib/event-labels'

export function EmailMarketingPreferenceFeedback({
  phase,
  error,
}: {
  phase: EmailMarketingPreferencePhase
  error?: string
}) {
  if (phase === 'saved') {
    return (
      <p className="mt-3 text-sm text-muted-foreground" role="status">
        {EMAIL_MARKETING_PREFERENCE_SAVED}
      </p>
    )
  }
  if (phase === 'blocked') {
    return (
      <div className="mt-3 text-sm text-danger" role="alert">
        <p>{EMAIL_MARKETING_RESUBSCRIPTION_BLOCKED}</p>
        <p className="mt-2">
          Email{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent underline">
            {SUPPORT_EMAIL}
          </a>{' '}
          if you need help.
        </p>
      </div>
    )
  }
  if (phase === 'unavailable') {
    return (
      <div className="mt-3 text-sm text-danger" role="alert">
        <p>{EMAIL_MARKETING_PREFERENCE_UNAVAILABLE}</p>
        <p className="mt-2">
          Email{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent underline">
            {SUPPORT_EMAIL}
          </a>{' '}
          if you need help.
        </p>
      </div>
    )
  }
  if (phase === 'error' && error) {
    return (
      <p className="mt-3 text-sm text-danger" role="alert">
        {error}
      </p>
    )
  }
  return null
}

export default function EmailMarketingPreferenceCard({
  optedIn,
}: {
  optedIn: boolean
}) {
  const router = useRouter()
  const [storedOptIn, setStoredOptIn] = useState(optedIn)
  const [checked, setChecked] = useState(optedIn)
  const [result, setResult] = useState<EmailMarketingPreferenceResult | null>(null)
  const [isPending, startTransition] = useTransition()
  const errorRef = useRef<HTMLDivElement>(null)
  if (storedOptIn !== optedIn) {
    setStoredOptIn(optedIn)
    setChecked(optedIn)
    setResult((current) =>
      current &&
      'status' in current &&
      (current.status === 'blocked_resubscription' || current.status === 'unavailable')
        ? current
        : null
    )
  }
  const phase = emailMarketingPreferencePhase({ pending: isPending, result })
  const displayChecked = displayedMarketingOptIn({
    stored: storedOptIn,
    draft: checked,
    result,
  })

  useEffect(() => {
    if (phase !== 'error' && phase !== 'blocked' && phase !== 'unavailable') return
    revealProfileSection('email-preferences', errorRef.current)
  }, [phase])

  return (
    <Card>
      <h2 className="profile-section-title text-display text-lg font-semibold">
        Email preferences
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {ACCOUNT_EMAIL_MARKETING_OPT_IN_EXPLANATION}
      </p>
      <label className="mt-4 flex items-start gap-3 text-sm text-foreground" htmlFor="email-marketing-opt-in">
        <input
          id="email-marketing-opt-in"
          name="email_marketing_opt_in"
          type="checkbox"
          className="mt-1"
          checked={displayChecked}
          disabled={isPending}
          onChange={(event) => {
            setChecked(event.target.checked)
            setResult(null)
          }}
        />
        <span>{ACCOUNT_EMAIL_MARKETING_OPT_IN_LABEL}</span>
      </label>
      <button
        type="button"
        className={`${buttonPrimaryClassName} ${mobileFullButtonClassName} mt-4`}
        disabled={isPending}
        onClick={() => {
          setResult(null)
          startTransition(async () => {
            const saved = await saveEmailMarketingPreference(checked)
            setResult(saved)
            if ('success' in saved && saved.success) router.refresh()
            if ('status' in saved && saved.status === 'blocked_resubscription') {
              router.refresh()
            }
          })
        }}
      >
        {phase === 'saving' ? 'Saving…' : 'Save email preference'}
      </button>
      <div ref={errorRef}>
        <EmailMarketingPreferenceFeedback
          phase={phase}
          error={result && 'error' in result ? result.error : undefined}
        />
      </div>
    </Card>
  )
}
