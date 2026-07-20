'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  adminAskRecipientToReconsider,
  adminDismissRecontactReview,
} from '@/app/(club)/admin/recontact-requests/actions'
import {
  buttonPrimaryClassName,
  buttonSecondaryClassName,
} from '@/lib/event-labels'
import type { RecontactQueueItem } from '@/lib/load-recontact-queue'

export default function AdminRecontactQueue({
  items,
}: {
  items: RecontactQueueItem[]
}) {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()

  const runAction = (
    conversationId: string,
    action: 'ask' | 'dismiss'
  ) => {
    setMessage('')
    startTransition(async () => {
      const result =
        action === 'ask'
          ? await adminAskRecipientToReconsider(conversationId)
          : await adminDismissRecontactReview(conversationId)

      if ('error' in result && result.error) {
        setMessage(result.error)
        return
      }

      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Admin does not approve messaging directly. Ask the recipient whether
        they want to allow one more message attempt.
      </p>

      {message ? <p className="text-sm text-danger">{message}</p> : null}

      {items.map((item) => (
        <article
          key={item.conversationId}
          className="rounded-xl border border-border bg-card p-5 shadow-sm"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-display text-lg font-semibold">
                {item.requester.name}
                <span className="text-muted-foreground"> → </span>
                {item.recipient.name}
              </h2>
              <p className="text-sm text-muted-foreground">
                Requested{' '}
                {new Date(item.recontactRequestedAt).toLocaleString()}
              </p>
            </div>
            <Link
              href={`/messages/${item.conversationId}`}
              className="text-sm font-medium text-accent underline"
            >
              View thread
            </Link>
          </div>

          {item.originalMessage ? (
            <div className="mt-4 rounded-lg border border-border bg-surface/50 p-3 text-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Original declined message
              </p>
              <p className="mt-2 whitespace-pre-wrap text-foreground">
                {item.originalMessage}
              </p>
              {item.originalMessageAt ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Sent {new Date(item.originalMessageAt).toLocaleString()}
                </p>
              ) : null}
            </div>
          ) : null}

          {item.recontactNote ? (
            <p className="mt-4 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Sender note:</span>{' '}
              {item.recontactNote}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-3 border-t border-border pt-4">
            <button
              type="button"
              disabled={isPending}
              onClick={() => runAction(item.conversationId, 'ask')}
              className={buttonPrimaryClassName}
            >
              Ask recipient to reconsider
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => runAction(item.conversationId, 'dismiss')}
              className={buttonSecondaryClassName}
            >
              Close without asking
            </button>
          </div>
        </article>
      ))}
    </div>
  )
}
