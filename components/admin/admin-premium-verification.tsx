'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Badge from '@/components/ui/badge'
import {
  premiumVerificationComplete,
  reviewStatusLabel,
  type PremiumVerification,
  type ReviewStatus,
} from '@/lib/membership-systems'
import { buttonSecondaryClassName, inputClassName } from '@/lib/event-labels'
import { updatePremiumVerification } from '@/app/(club)/admin/applications/membership-actions'

const STATUS_OPTIONS: ReviewStatus[] = [
  'incomplete',
  'pending_review',
  'approved',
  'needs_followup',
  'rejected',
]

export default function AdminPremiumVerification({
  applicantId,
  premium,
}: {
  applicantId: string
  premium: PremiumVerification
}) {
  const router = useRouter()
  const [providerRef, setProviderRef] = useState(premium.provider_reference ?? '')
  const [holdReason, setHoldReason] = useState(premium.admin_hold_reason ?? '')
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()

  const update = (patch: Partial<PremiumVerification>) => {
    setMessage('')
    startTransition(async () => {
      const result = await updatePremiumVerification(applicantId, patch)
      if (result.error) {
        setMessage(result.error)
        return
      }
      router.refresh()
    })
  }

  const complete = premiumVerificationComplete(premium)

  return (
    <div className="grid gap-4 text-sm">
      <p className="text-xs leading-relaxed text-muted-foreground">
        Admin-only vendor verification foundation. Raw provider data stays
        private — members only see a &quot;Vendor reviewed&quot; badge when all
        checks pass and public badge is enabled.
      </p>

      <div className="flex flex-wrap gap-2">
        {complete ? (
          <Badge variant="success">Premium path complete</Badge>
        ) : (
          <Badge variant="muted">Premium path incomplete</Badge>
        )}
        {premium.admin_hold ? (
          <Badge variant="warning">Manual hold</Badge>
        ) : null}
        {premium.public_badge === 'vendor_reviewed' ? (
          <Badge variant="accent">Public badge enabled</Badge>
        ) : null}
      </div>

      {(
        [
          ['id_verification', 'Government ID / vendor ID'],
          ['liveness_match', 'Selfie / liveness match'],
          ['background_check', 'Background check'],
        ] as const
      ).map(([key, label]) => (
        <label key={key} className="grid gap-1.5">
          <span className="font-medium text-foreground">{label}</span>
          <select
            value={premium[key]}
            disabled={isPending}
            onChange={(e) =>
              update({ [key]: e.target.value as ReviewStatus })
            }
            className={inputClassName}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {reviewStatusLabel(s)}
              </option>
            ))}
          </select>
        </label>
      ))}

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={premium.consent_captured}
          disabled={isPending}
          onChange={(e) => update({ consent_captured: e.target.checked })}
        />
        <span>Consent captured</span>
      </label>

      <label className="grid gap-1.5">
        <span className="font-medium text-foreground">Provider reference (private)</span>
        <input
          className={inputClassName}
          value={providerRef}
          onChange={(e) => setProviderRef(e.target.value)}
          placeholder="Vendor session / case ID"
        />
        <button
          type="button"
          className={buttonSecondaryClassName}
          disabled={isPending}
          onClick={() => update({ provider_reference: providerRef.trim() || null })}
        >
          Save reference
        </button>
      </label>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={premium.admin_hold}
          disabled={isPending}
          onChange={(e) => update({ admin_hold: e.target.checked })}
        />
        <span>Manual hold</span>
      </label>

      {premium.admin_hold ? (
        <label className="grid gap-1.5">
          <span className="font-medium text-foreground">Hold reason (private)</span>
          <input
            className={inputClassName}
            value={holdReason}
            onChange={(e) => setHoldReason(e.target.value)}
          />
          <button
            type="button"
            className={buttonSecondaryClassName}
            disabled={isPending}
            onClick={() =>
              update({ admin_hold_reason: holdReason.trim() || null })
            }
          >
            Save hold reason
          </button>
        </label>
      ) : null}

      <button
        type="button"
        className={buttonSecondaryClassName}
        disabled={isPending || !complete}
        onClick={() => {
          if (
            !window.confirm(
              'Enable public Vendor reviewed badge for this member?'
            )
          ) {
            return
          }
          update({ public_badge: 'vendor_reviewed' })
        }}
      >
        Enable public vendor badge
      </button>

      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  )
}
