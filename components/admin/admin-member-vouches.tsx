'use client'

import { useTransition } from 'react'
import { moderateMemberVouch } from '@/app/(club)/members/vouch-actions'
import Badge from '@/components/ui/badge'
import {
  vouchTypeLabel,
  type MemberVouch,
} from '@/lib/member-vouches'
import { buttonSecondaryClassName } from '@/lib/event-labels'

export default function AdminMemberVouches({
  vouches,
}: {
  vouches: MemberVouch[]
}) {
  const [isPending, startTransition] = useTransition()

  if (vouches.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No member vouches on record.
      </p>
    )
  }

  const moderate = (vouchId: string, status: 'approved' | 'rejected') => {
    startTransition(async () => {
      await moderateMemberVouch({ vouchId, status })
    })
  }

  return (
    <ul className="grid gap-3 text-sm">
      {vouches.map((vouch) => (
        <li
          key={vouch.id}
          className="rounded-lg border border-border bg-background/50 p-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={vouch.status === 'approved' ? 'success' : 'muted'}>
              {vouch.status}
            </Badge>
            <span className="font-medium text-foreground">
              {vouchTypeLabel(vouch.vouch_type)}
            </span>
          </div>
          <p className="mt-2 text-muted-foreground">
            Context: {vouch.relationship_context}
          </p>
          {vouch.note ? (
            <p className="mt-1 text-muted-foreground">
              <span className="font-medium text-foreground">Endorsement: </span>
              {vouch.note}
            </p>
          ) : (
            <p className="mt-1 text-muted-foreground">
              No written endorsement was submitted.
            </p>
          )}
          {vouch.moderation_reason ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Internal note: {vouch.moderation_reason}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {vouch.status !== 'approved' ? (
              <button
                type="button"
                className={buttonSecondaryClassName}
                disabled={isPending}
                onClick={() => moderate(vouch.id, 'approved')}
              >
                Approve
              </button>
            ) : null}
            {vouch.status !== 'rejected' ? (
              <button
                type="button"
                className={buttonSecondaryClassName}
                disabled={isPending}
                onClick={() => moderate(vouch.id, 'rejected')}
              >
                Reject
              </button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  )
}
