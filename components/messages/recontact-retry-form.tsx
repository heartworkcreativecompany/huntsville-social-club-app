'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { retryMessageRequestAction } from '@/app/(club)/messages/actions'
import {
  MAX_MEMBER_MESSAGE_LENGTH,
  validateMemberMessageBody,
} from '@/lib/member-message-limits'
import { buttonPrimaryClassName, inputClassName } from '@/lib/event-labels'

export default function RecontactRetryForm({
  conversationId,
  otherUserName,
}: {
  conversationId: string
  otherUserName: string
}) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const bodyValidationError = body.trim() ? validateMemberMessageBody(body) : null

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    const validationError = validateMemberMessageBody(body)
    if (validationError) {
      setError(validationError)
      return
    }

    startTransition(async () => {
      const result = await retryMessageRequestAction({ conversationId, body })
      if ('error' in result && result.error) {
        setError(result.error)
        return
      }

      setBody('')
      router.refresh()
    })
  }

  return (
    <div className="border-t border-border bg-accent-soft/20 px-5 py-4">
      <p className="text-sm font-medium text-foreground">Send your one follow-up message</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {otherUserName} agreed to one more message request. This is your only
        additional attempt.
      </p>
      <form onSubmit={handleSubmit} className="mt-4 grid gap-3">
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-foreground">Opening message</span>
          <textarea
            value={body}
            onChange={(event) =>
              setBody(event.target.value.slice(0, MAX_MEMBER_MESSAGE_LENGTH))
            }
            rows={4}
            maxLength={MAX_MEMBER_MESSAGE_LENGTH}
            className={`${inputClassName} min-h-[6rem]`}
            disabled={isPending}
          />
        </label>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <button
          type="submit"
          disabled={isPending || !body.trim() || Boolean(bodyValidationError)}
          className={`${buttonPrimaryClassName} w-fit`}
        >
          {isPending ? 'Sending…' : 'Send message request'}
        </button>
      </form>
    </div>
  )
}
