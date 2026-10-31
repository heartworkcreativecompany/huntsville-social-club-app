'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import {
  buttonPrimaryClassName,
  buttonSecondaryClassName,
  mobileFullButtonClassName,
} from '@/lib/event-labels'
import type { AccountIdentityVerificationCard } from '@/lib/account-identity-verification'

export default function IdentityVerificationCard({
  card,
  lastError = null,
}: {
  card: AccountIdentityVerificationCard
  lastError?: string | null
}) {
  const router = useRouter()
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const startSession = () => {
    if (!card.createsSession) return
    setError('')
    startTransition(async () => {
      const response = await fetch('/api/stripe/identity/session', {
        method: 'POST',
      })
      const payload = (await response.json().catch(() => ({}))) as {
        url?: string
        error?: string
      }
      if (!response.ok || !payload.url) {
        setError(payload.error ?? 'Could not start identity verification.')
        return
      }
      window.location.href = payload.url
    })
  }

  return (
    <Card>
      <div className="profile-section-title flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-display text-lg font-semibold">Identity verification</h2>
        <Badge variant={card.statusLabel === 'Identity verified' ? 'success' : 'muted'}>
          {card.statusLabel}
        </Badge>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{card.detail}</p>
      {card.action === 'retry' && lastError ? (
        <p className="mt-3 text-sm text-danger">{lastError}</p>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {card.action && card.actionLabel ? (
        <button
          type="button"
          className={`${buttonPrimaryClassName} ${mobileFullButtonClassName} mt-4`}
          data-creates-session={card.createsSession ? 'true' : 'false'}
          disabled={isPending}
          onClick={startSession}
        >
          {isPending ? 'Starting…' : card.actionLabel}
        </button>
      ) : card.statusLabel === 'Pending' || card.statusLabel === 'Processing' || card.statusLabel === 'Unavailable' ? (
        <button
          type="button"
          className={`${buttonSecondaryClassName} ${mobileFullButtonClassName} mt-4`}
          data-creates-session="false"
          onClick={() => router.refresh()}
        >
          Refresh status
        </button>
      ) : null}
    </Card>
  )
}
