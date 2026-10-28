'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  approveInPersonIdentityVerification,
  revokeInPersonIdentityVerification,
} from '@/app/(club)/admin/applications/identity-actions'
import type { ActiveInPersonIdentity } from '@/lib/identity-verification-admin'
import { buttonPrimaryClassName, buttonSecondaryClassName } from '@/lib/event-labels'

export default function AdminInPersonIdentityVerification({
  profileId,
  active,
}: {
  profileId: string
  active: ActiveInPersonIdentity | null
}) {
  const router = useRouter()
  const [note, setNote] = useState('')
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()

  const approve = () => {
    if (
      !window.confirm(
        'Approve in-person identity verification? This does not approve membership and does not change Stripe.'
      )
    ) {
      return
    }
    setMessage('')
    startTransition(async () => {
      const result = await approveInPersonIdentityVerification(profileId, note)
      if (result.error) {
        setMessage(result.error)
        return
      }
      setNote('')
      setMessage(
        result.alreadyVerified
          ? 'In-person identity verification is already recorded.'
          : 'In-person identity verification recorded.'
      )
      router.refresh()
    })
  }

  const revoke = () => {
    if (
      !window.confirm(
        'Revoke in-person identity verification? Stripe verification, if any, stays in place.'
      )
    ) {
      return
    }
    setMessage('')
    startTransition(async () => {
      const result = await revokeInPersonIdentityVerification(profileId)
      if (result.error) {
        setMessage(result.error)
        return
      }
      setMessage('In-person identity verification revoked.')
      router.refresh()
    })
  }

  return (
    <div className="mt-4 grid gap-3 border-t border-border pt-4">
      <div>
        <h3 className="text-sm font-medium text-foreground">
          In-person identity verification
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Separate from membership approval and from Stripe Identity. Approving
          here records that an admin checked this person in person. No identity
          document is uploaded or stored.
        </p>
      </div>

      {active ? (
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Status</dt>
            <dd className="font-medium text-foreground">Verified in person</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Recorded</dt>
            <dd className="font-medium text-foreground">
              {active.approvedAt
                ? new Date(active.approvedAt).toLocaleString()
                : active.reconciledAt
                  ? `Legacy reconciliation ${new Date(active.reconciledAt).toLocaleString()}`
                  : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Approving admin</dt>
            <dd className="font-medium text-foreground">
              {active.hasApprover ? 'Recorded' : 'Not stored on this legacy row'}
            </dd>
          </div>
          {active.note ? (
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Internal note</dt>
              <dd className="font-medium text-foreground">{active.note}</dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Optional internal note</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={280}
            rows={2}
            className="rounded-md border border-border bg-surface px-2 py-1 text-sm"
          />
        </label>
      )}

      <div className="flex flex-wrap gap-2">
        {active ? (
          <button
            type="button"
            className={buttonSecondaryClassName}
            disabled={isPending}
            onClick={revoke}
          >
            Revoke in-person identity verification
          </button>
        ) : (
          <button
            type="button"
            className={buttonPrimaryClassName}
            disabled={isPending}
            onClick={approve}
          >
            Approve in-person identity verification
          </button>
        )}
      </div>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  )
}
