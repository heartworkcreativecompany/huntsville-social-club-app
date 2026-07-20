'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Badge from '@/components/ui/badge'
import {
  APPROVAL_GATE_DEFS,
  canApproveMember,
  reviewStatusLabel,
  type ApprovalGates,
  type ApprovalGateKey,
  type ReviewStatus,
} from '@/lib/membership-systems'
import { buttonSecondaryClassName } from '@/lib/event-labels'
import {
  markApplicationReviewed,
  markPhotosReviewed,
  syncEmailGateFromAuth,
  updateApprovalGate,
} from '@/app/(club)/admin/applications/membership-actions'

const GATE_STATUS_OPTIONS: ReviewStatus[] = [
  'incomplete',
  'pending_review',
  'approved',
  'needs_followup',
  'rejected',
]

export default function AdminApprovalGates({
  applicantId,
  gates,
}: {
  applicantId: string
  gates: ApprovalGates
}) {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()
  const check = canApproveMember(gates)

  const setGate = (gate: ApprovalGateKey, status: ReviewStatus) => {
    setMessage('')
    startTransition(async () => {
      const result = await updateApprovalGate(applicantId, gate, status)
      if (result.error) {
        setMessage(result.error)
        return
      }
      router.refresh()
    })
  }

  const runQuick = (action: () => Promise<{ error?: string }>, label: string) => {
    setMessage('')
    startTransition(async () => {
      const result = await action()
      if (result.error) {
        setMessage(result.error)
        return
      }
      setMessage(`${label} updated.`)
      router.refresh()
    })
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {check.allowed ? (
          <Badge variant="success">All required gates complete — ready to approve</Badge>
        ) : (
          <Badge variant="warning">
            {check.blockers.length} gate{check.blockers.length === 1 ? '' : 's'}{' '}
            blocking approval
          </Badge>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        Required gates must be approved before membership approval. Members verify phone OTP on their profile page. Email sync reads Supabase Auth confirmation status.
      </p>

      <ul className="grid gap-3">
        {APPROVAL_GATE_DEFS.map((def) => {
          const status = gates[def.key] ?? 'incomplete'
          return (
            <li
              key={def.key}
              className="rounded-lg border border-border bg-background/50 px-3 py-3 text-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-foreground">{def.label}</p>
                    <Badge variant={def.requiredForApproval ? 'accent' : 'muted'}>
                      {def.requiredForApproval ? 'Required' : 'Optional'}
                    </Badge>
                    {!def.implemented ? (
                      <Badge variant="muted">Not implemented</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {def.description}
                  </p>
                </div>
                <Badge
                  variant={
                    status === 'approved'
                      ? 'success'
                      : status === 'pending_review' || status === 'needs_followup'
                        ? 'warning'
                        : 'muted'
                  }
                >
                  {reviewStatusLabel(status)}
                </Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <select
                  value={status}
                  disabled={isPending}
                  onChange={(e) =>
                    setGate(def.key, e.target.value as ReviewStatus)
                  }
                  className="rounded-md border border-border bg-surface px-2 py-1 text-xs"
                >
                  {GATE_STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {reviewStatusLabel(s)}
                    </option>
                  ))}
                </select>
              </div>
            </li>
          )
        })}
      </ul>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonSecondaryClassName}
          disabled={isPending}
          onClick={() => runQuick(() => syncEmailGateFromAuth(applicantId), 'Email gate')}
        >
          Sync email from Auth
        </button>
        <button
          type="button"
          className={buttonSecondaryClassName}
          disabled={isPending}
          onClick={() => runQuick(() => markPhotosReviewed(applicantId), 'Photos')}
        >
          Mark photos reviewed
        </button>
        <button
          type="button"
          className={buttonSecondaryClassName}
          disabled={isPending}
          onClick={() =>
            runQuick(() => markApplicationReviewed(applicantId), 'Application')
          }
        >
          Mark application reviewed
        </button>
      </div>

      {message ? (
        <p className="text-sm text-muted-foreground">{message}</p>
      ) : null}
    </div>
  )
}
