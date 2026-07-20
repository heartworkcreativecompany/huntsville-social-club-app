'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import { buttonPrimaryClassName, buttonSecondaryClassName } from '@/lib/event-labels'
import type { IdentityVerificationStatus } from '@/lib/stripe/identity'

function statusLabel(status: IdentityVerificationStatus): string {
  switch (status) {
    case 'verified':
      return 'Verified'
    case 'requires_input':
      return 'Action needed'
    case 'processing':
      return 'Processing'
    case 'pending':
      return 'In progress'
    case 'canceled':
      return 'Canceled'
    case 'not_started':
    default:
      return 'Not started'
  }
}

function statusVariant(
  status: IdentityVerificationStatus
): 'success' | 'warning' | 'muted' {
  if (status === 'verified') return 'success'
  if (status === 'requires_input' || status === 'pending' || status === 'processing') {
    return 'warning'
  }
  return 'muted'
}

export default function IdentityVerificationCard({
  status,
  lastError,
  verifiedAt,
  showReturnNotice = false,
}: {
  status: IdentityVerificationStatus
  lastError?: string | null
  verifiedAt?: string | null
  showReturnNotice?: boolean
}) {
  const router = useRouter()
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const isVerified = status === 'verified'
  const ctaLabel =
    status === 'requires_input'
      ? 'Retry identity verification'
      : status === 'pending' || status === 'processing'
        ? 'Continue identity verification'
        : 'Verify your identity'

  const startVerification = () => {
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
    <Card padding="sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-display text-base font-medium text-foreground">
            Identity verification
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Required before membership approval. You will scan a government ID
            and take a matching selfie. Stripe handles verification — we do not
            store document or selfie images.
          </p>
        </div>
        <Badge variant={statusVariant(status)}>{statusLabel(status)}</Badge>
      </div>

      {showReturnNotice && !isVerified ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Thanks — if verification is still processing, this page will update
          when Stripe finishes. You can refresh in a moment.
        </p>
      ) : null}

      {isVerified && verifiedAt ? (
        <p className="mt-3 text-sm text-foreground">
          Verified {new Date(verifiedAt).toLocaleString()}
        </p>
      ) : null}

      {status === 'requires_input' && lastError ? (
        <p className="mt-3 text-sm text-danger">{lastError}</p>
      ) : null}

      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {!isVerified ? (
          <button
            type="button"
            className={buttonPrimaryClassName}
            disabled={isPending}
            onClick={startVerification}
          >
            {isPending ? 'Starting…' : ctaLabel}
          </button>
        ) : null}
        <button
          type="button"
          className={buttonSecondaryClassName}
          disabled={isPending}
          onClick={() => router.refresh()}
        >
          Refresh status
        </button>
      </div>
    </Card>
  )
}
