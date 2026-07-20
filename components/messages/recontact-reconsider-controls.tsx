'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { respondToRecontactPromptAction } from '@/app/(club)/messages/actions'
import { buttonPrimaryClassName } from '@/lib/event-labels'

export default function RecontactReconsiderControls({
  conversationId,
  requesterName,
}: {
  conversationId: string
  requesterName: string
}) {
  const router = useRouter()
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const runAction = (allow: boolean) => {
    setError('')
    startTransition(async () => {
      const result = await respondToRecontactPromptAction({
        conversationId,
        allow,
      })

      if ('error' in result && result.error) {
        setError(result.error)
        return
      }

      router.refresh()
    })
  }

  return (
    <div className="border-b border-border bg-warning-soft/30 px-5 py-4">
      <p className="text-sm font-medium text-foreground">Allow one more message?</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {requesterName} asked to contact you again after you declined their first
        message. Our team confirmed this with you — you can allow exactly one more
        message request, or keep this closed.
      </p>
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => runAction(true)}
          disabled={isPending}
          className={buttonPrimaryClassName}
        >
          {isPending ? 'Saving…' : 'Allow one more message'}
        </button>
        <button
          type="button"
          onClick={() => runAction(false)}
          disabled={isPending}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60"
        >
          Keep declined
        </button>
      </div>
    </div>
  )
}
