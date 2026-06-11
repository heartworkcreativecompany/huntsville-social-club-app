'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  buttonPrimaryClassName,
  buttonSecondaryClassName,
  inputClassName,
} from '@/lib/event-labels'
import {
  approveApplication,
  markInReview,
  rejectApplication,
  requestMoreInfo,
} from './actions'

export default function ApplicationReviewActions({
  applicantId,
}: {
  applicantId: string
}) {
  const router = useRouter()
  const [notes, setNotes] = useState('')
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()

  const run = (
    action: () => Promise<{ error?: string; success?: boolean }>,
    confirmMessage?: string
  ) => {
    if (confirmMessage && !window.confirm(confirmMessage)) {
      return
    }

    setMessage('')
    startTransition(async () => {
      const result = await action()
      if (result.error) {
        setMessage(result.error)
        return
      }
      setMessage('Status updated.')
      router.refresh()
    })
  }

  return (
    <div className="grid gap-4">
      <label className="grid gap-1.5 text-sm">
        <span className="font-medium text-foreground">
          Notes to applicant
        </span>
        <span className="text-xs text-muted-foreground">
          Required for reject or needs info. Shown to the applicant when
          applicable.
        </span>
        <textarea
          className={`${inputClassName} resize-y`}
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Guidance for the applicant (reject / needs info)"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonPrimaryClassName}
          disabled={isPending}
          onClick={() =>
            run(
              () => approveApplication(applicantId),
              'Approve this application and grant verified membership?'
            )
          }
        >
          Approve
        </button>
        <button
          type="button"
          className={buttonSecondaryClassName}
          disabled={isPending}
          onClick={() =>
            run(
              () => markInReview(applicantId),
              'Mark as in review (internal follow-up marker)?'
            )
          }
        >
          Needs follow-up
        </button>
        <button
          type="button"
          className={buttonSecondaryClassName}
          disabled={isPending}
          onClick={() =>
            run(
              () => requestMoreInfo(applicantId, notes),
              'Request more information from this applicant?'
            )
          }
        >
          Request more info
        </button>
        <button
          type="button"
          className={buttonSecondaryClassName}
          disabled={isPending}
          onClick={() =>
            run(
              () => rejectApplication(applicantId, notes),
              'Reject this application? This sends a notification to the applicant.'
            )
          }
        >
          Reject
        </button>
      </div>

      {message ? (
        <p className="text-sm text-muted-foreground">{message}</p>
      ) : null}
    </div>
  )
}
