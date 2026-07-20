'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  acceptMessageRequestAction,
  declineMessageRequestAction,
} from '@/app/(club)/messages/actions'
import { buttonPrimaryClassName } from '@/lib/event-labels'

export default function MessageRequestControls({
  conversationId,
}: {
  conversationId: string
}) {
  const router = useRouter()
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const runAction = (action: 'accept' | 'decline') => {
    setError('')
    startTransition(async () => {
      const result =
        action === 'accept'
          ? await acceptMessageRequestAction(conversationId)
          : await declineMessageRequestAction(conversationId)

      if ('error' in result && result.error) {
        setError(result.error)
        return
      }

      router.refresh()
    })
  }

  return (
    <div className="border-b border-border bg-warning-soft/30 px-5 py-4">
      <p className="text-sm font-medium text-foreground">Message request</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Accept to open a private conversation, or decline to close this request.
      </p>
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => runAction('accept')}
          disabled={isPending}
          className={buttonPrimaryClassName}
        >
          {isPending ? 'Working…' : 'Accept'}
        </button>
        <button
          type="button"
          onClick={() => runAction('decline')}
          disabled={isPending}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60"
        >
          Decline
        </button>
      </div>
    </div>
  )
}
