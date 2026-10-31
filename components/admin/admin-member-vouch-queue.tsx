'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { moderateMemberVouch } from '@/app/(club)/members/vouch-actions'
import Badge from '@/components/ui/badge'
import { buttonSecondaryClassName, inputClassName } from '@/lib/event-labels'
import { vouchTypeLabel } from '@/lib/member-vouches'
import type { VouchModerationItem } from '@/lib/load-vouch-moderation-queue'

export default function AdminMemberVouchQueue({
  items,
}: {
  items: VouchModerationItem[]
}) {
  const [isPending, startTransition] = useTransition()
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')

  const review = (vouchId: string, status: 'approved' | 'rejected') => {
    setMessage('')
    startTransition(async () => {
      const result = await moderateMemberVouch({
        vouchId,
        status,
        reason: notes[vouchId],
      })
      if (result.error) {
        setMessage(result.error)
        return
      }
      setMessage(status === 'approved' ? 'Vouch approved.' : 'Vouch rejected.')
    })
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No vouches in this filter.
      </p>
    )
  }

  return (
    <div className="grid gap-4">
      {message ? (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      ) : null}
      <ul className="grid gap-4">
        {items.map((item) => (
          <li
            key={item.id}
            className="rounded-lg border border-border bg-background/50 p-4 text-sm"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={item.status === 'approved' ? 'success' : item.status === 'pending' ? 'warning' : 'muted'}>
                {item.status}
              </Badge>
              <span className="font-medium text-foreground">
                {vouchTypeLabel(item.vouch_type)}
              </span>
            </div>
            <p className="mt-2 text-foreground">
              <Link href={`/members/${item.voucher_id}`} className="underline">
                {item.authorName}
              </Link>
              <span className="text-muted-foreground"> vouched for </span>
              <Link href={`/members/${item.vouchee_id}`} className="underline">
                {item.recipientName}
              </Link>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Submitted {new Date(item.created_at).toLocaleString()}
              {item.moderated_at
                ? ` · Reviewed ${new Date(item.moderated_at).toLocaleString()}`
                : ''}
            </p>
            <p className="mt-3 whitespace-pre-wrap leading-relaxed text-foreground">
              {item.note?.trim()
                ? item.note
                : 'No written endorsement was submitted.'}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Context: {item.relationship_context}
            </p>
            <label className="mt-3 grid gap-1 text-xs">
              <span className="font-medium text-foreground">
                Internal note (optional)
              </span>
              <input
                className={inputClassName}
                value={notes[item.id] ?? item.moderation_reason ?? ''}
                onChange={(event) =>
                  setNotes((current) => ({
                    ...current,
                    [item.id]: event.target.value,
                  }))
                }
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              {item.status !== 'approved' ? (
                <button
                  type="button"
                  className={buttonSecondaryClassName}
                  disabled={isPending}
                  onClick={() => review(item.id, 'approved')}
                >
                  Approve
                </button>
              ) : null}
              {item.status !== 'rejected' ? (
                <button
                  type="button"
                  className={buttonSecondaryClassName}
                  disabled={isPending}
                  onClick={() => review(item.id, 'rejected')}
                >
                  Reject
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
