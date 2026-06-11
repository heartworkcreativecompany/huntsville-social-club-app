'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Badge from '@/components/ui/badge'
import {
  reviewStatusLabel,
  type LocalityConfirmation,
  type ReviewStatus,
} from '@/lib/membership-systems'
import { buttonSecondaryClassName, inputClassName } from '@/lib/event-labels'
import {
  syncLocalityFromDraft,
  updateLocalityReview,
} from '@/app/(club)/admin/applications/membership-actions'

export default function AdminLocalityReview({
  applicantId,
  locality,
}: {
  applicantId: string
  locality: LocalityConfirmation
}) {
  const router = useRouter()
  const [notes, setNotes] = useState(locality.adminNotes ?? '')
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()

  const run = (
    status: ReviewStatus,
    confirmMessage?: string
  ) => {
    if (confirmMessage && !window.confirm(confirmMessage)) return
    setMessage('')
    startTransition(async () => {
      const result = await updateLocalityReview(applicantId, {
        reviewStatus: status,
        adminNotes: notes,
      })
      if (result.error) {
        setMessage(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="grid gap-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant={
            locality.reviewStatus === 'approved'
              ? 'success'
              : locality.reviewStatus === 'pending_review'
                ? 'warning'
                : 'muted'
          }
        >
          {reviewStatusLabel(locality.reviewStatus)}
        </Badge>
      </div>

      <dl className="grid gap-3">
        <div>
          <dt className="text-muted-foreground">City (private)</dt>
          <dd className="font-medium text-foreground">{locality.city || '—'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">ZIP (private)</dt>
          <dd className="font-medium text-foreground">{locality.zip || '—'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Public area</dt>
          <dd className="font-medium text-foreground">
            {locality.neighborhood || '—'}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Work / industry context</dt>
          <dd className="text-foreground">{locality.workContext || '—'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">School / community context</dt>
          <dd className="text-foreground">
            {locality.schoolOrCommunityContext || '—'}
          </dd>
        </div>
        {locality.socialLink ? (
          <div>
            <dt className="text-muted-foreground">Social / website</dt>
            <dd className="text-foreground">{locality.socialLink}</dd>
          </div>
        ) : null}
      </dl>

      <label className="grid gap-1.5">
        <span className="font-medium text-foreground">Internal locality notes</span>
        <textarea
          className={`${inputClassName} resize-y`}
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Admin-only — not shown to applicant"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonSecondaryClassName}
          disabled={isPending}
          onClick={() => {
            setMessage('')
            startTransition(async () => {
              const result = await syncLocalityFromDraft(applicantId)
              if (result.error) setMessage(result.error)
              else router.refresh()
            })
          }}
        >
          Sync from application
        </button>
        <button
          type="button"
          className={buttonSecondaryClassName}
          disabled={isPending}
          onClick={() => run('pending_review')}
        >
          Mark pending
        </button>
        <button
          type="button"
          className={buttonSecondaryClassName}
          disabled={isPending}
          onClick={() =>
            run('approved', 'Confirm locality for this applicant?')
          }
        >
          Confirm locality
        </button>
        <button
          type="button"
          className={buttonSecondaryClassName}
          disabled={isPending}
          onClick={() => run('needs_followup')}
        >
          Needs follow-up
        </button>
      </div>

      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  )
}
