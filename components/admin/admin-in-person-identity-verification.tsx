'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  approveInPersonIdentityVerification,
  revokeInPersonIdentityVerification,
} from '@/app/(club)/admin/applications/identity-actions'
import type { AcceptedIdentityStatus } from '@/lib/identity-verification'
import {
  adminIdentitySourceLabels,
  IN_PERSON_RECORD_BUTTON,
  IN_PERSON_RECORD_CONFIRMATION,
  IN_PERSON_REVOCATION_EXPLANATION,
  IN_PERSON_REVOKE_BUTTON,
  type ActiveInPersonIdentity,
  type InPersonIdentityHistoryEntry,
} from '@/lib/identity-verification-admin'
import { identityVerificationDisplayLabel } from '@/lib/membership-systems'
import { buttonPrimaryClassName, buttonSecondaryClassName } from '@/lib/event-labels'

function formatTimestamp(value: string | null): string {
  if (!value) return '—'
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return '—'
  return new Date(parsed).toLocaleString()
}

function acceptedLabel(status: AcceptedIdentityStatus): string {
  if (status === 'verified') return 'Accepted'
  if (status === 'unverified') return 'Not accepted'
  return 'Unavailable'
}

export default function AdminInPersonIdentityVerification({
  profileId,
  accepted,
  stripeStatus,
  lookupOk,
  active,
  history,
}: {
  profileId: string
  accepted: AcceptedIdentityStatus
  stripeStatus: string | null
  lookupOk: boolean
  active: ActiveInPersonIdentity | null
  history: InPersonIdentityHistoryEntry[]
}) {
  const router = useRouter()
  const [confirmed, setConfirmed] = useState(false)
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()
  const sources = adminIdentitySourceLabels({
    stripeStatus,
    active: Boolean(active),
  })

  const record = () => {
    setMessage('')
    startTransition(async () => {
      const result = await approveInPersonIdentityVerification(
        profileId,
        confirmed
      )
      if (result.error) {
        setMessage(result.error)
        return
      }
      setConfirmed(false)
      setMessage(
        result.alreadyVerified
          ? 'In-person identity verification is already recorded.'
          : 'In-person identity verification recorded.'
      )
      router.refresh()
    })
  }

  const revoke = () => {
    setMessage('')
    startTransition(async () => {
      const result = await revokeInPersonIdentityVerification(profileId, reason)
      if (result.error) {
        setMessage(result.error)
        return
      }
      setReason('')
      setMessage('In-person identity verification revoked.')
      router.refresh()
    })
  }

  const verifier = !active
    ? null
    : active.verifierName
      ? active.verifierName
      : active.hasApprover
        ? 'Name unavailable'
        : 'Not stored on this legacy row'

  return (
    <div className="mt-4 grid gap-3 border-t border-border pt-4">
      <div>
        <h3 className="text-sm font-medium text-foreground">
          Identity verification
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          An in-person record is a staff check. It is not Stripe Identity
          verification, and it does not approve membership or change a
          subscription.
        </p>
      </div>

      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Accepted identity</dt>
          <dd className="font-medium text-foreground">{acceptedLabel(accepted)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Accepted sources</dt>
          <dd className="font-medium text-foreground">
            {sources.length > 0 ? sources.join(', ') : 'None'}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Stripe Identity</dt>
          <dd className="font-medium text-foreground">
            {identityVerificationDisplayLabel(stripeStatus)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">In-person record</dt>
          <dd className="font-medium text-foreground">
            {active ? 'Active' : 'None'}
          </dd>
        </div>
        {active ? (
          <>
            <div>
              <dt className="text-muted-foreground">In-person verifier</dt>
              <dd className="font-medium text-foreground">{verifier}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Recorded</dt>
              <dd className="font-medium text-foreground">
                {active.approvedAt
                  ? formatTimestamp(active.approvedAt)
                  : active.reconciledAt
                    ? `Legacy reconciliation ${formatTimestamp(active.reconciledAt)}`
                    : '—'}
              </dd>
            </div>
          </>
        ) : null}
      </dl>

      <div>
        <h4 className="text-sm font-medium text-foreground">
          Revocation history
        </h4>
        {history.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            No in-person revocations are recorded.
          </p>
        ) : (
          <ul className="mt-2 grid gap-2 text-sm">
            {history.map((entry) => (
              <li key={entry.id} className="rounded-md border border-border p-2">
                <p className="font-medium text-foreground">
                  Revoked {formatTimestamp(entry.revokedAt)}
                  {entry.revokerName ? ` by ${entry.revokerName}` : ''}
                </p>
                <p className="text-muted-foreground">
                  Recorded {formatTimestamp(entry.recordedAt)}
                  {entry.verifierName ? ` by ${entry.verifierName}` : ''}
                </p>
                <p className="text-muted-foreground">
                  Reason: {entry.reason ?? 'Reason not stored'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {IN_PERSON_REVOCATION_EXPLANATION}
      </p>

      {lookupOk ? (
        active ? (
          <div className="grid gap-2">
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Revocation reason</span>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={280}
                rows={2}
                required
                className="rounded-md border border-border bg-surface px-2 py-1 text-sm"
              />
            </label>
            <button
              type="button"
              className={buttonSecondaryClassName}
              disabled={isPending || reason.trim().length === 0}
              onClick={revoke}
            >
              {IN_PERSON_REVOKE_BUTTON}
            </button>
          </div>
        ) : (
          <div className="grid gap-2">
            <label className="flex items-start gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <span>{IN_PERSON_RECORD_CONFIRMATION}</span>
            </label>
            <button
              type="button"
              className={buttonPrimaryClassName}
              disabled={isPending || !confirmed}
              onClick={record}
            >
              {IN_PERSON_RECORD_BUTTON}
            </button>
          </div>
        )
      ) : (
        <p className="text-sm text-muted-foreground">
          In-person records could not be loaded. Nothing was changed.
        </p>
      )}

      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  )
}
