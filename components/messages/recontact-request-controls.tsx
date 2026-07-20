'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { requestRecontactReviewAction } from '@/app/(club)/messages/actions'
import { buttonSecondaryClassName, inputClassName } from '@/lib/event-labels'

export default function RecontactRequestControls({
  conversationId,
}: {
  conversationId: string
}) {
  const router = useRouter()
  const [note, setNote] = useState('')
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    setMessage('')

    startTransition(async () => {
      const result = await requestRecontactReviewAction({
        conversationId,
        note,
      })

      if ('error' in result && result.error) {
        setMessage(result.error)
        return
      }

      setNote('')
      setMessage('Recontact review requested. We will follow up if the recipient is open to another message.')
      router.refresh()
    })
  }

  return (
    <div className="border-t border-border bg-surface/40 px-5 py-4">
      <p className="text-sm font-medium text-foreground">Request another chance</p>
      <p className="mt-1 text-sm text-muted-foreground">
        You cannot message this member again directly. You may ask our team to
        check whether they are open to one more message request.
      </p>
      <form onSubmit={handleSubmit} className="mt-4 grid gap-3">
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-foreground">
            Optional note for staff (not shown to the recipient yet)
          </span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value.slice(0, 1000))}
            rows={3}
            maxLength={1000}
            className={`${inputClassName} min-h-[5rem]`}
            disabled={isPending}
          />
        </label>
        <button
          type="submit"
          disabled={isPending}
          className={`${buttonSecondaryClassName} w-fit`}
        >
          {isPending ? 'Submitting…' : 'Request recontact review'}
        </button>
      </form>
      {message ? <p className="mt-3 text-sm text-muted-foreground">{message}</p> : null}
    </div>
  )
}
