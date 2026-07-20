'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { requestCuratedMatchIntro } from '@/app/(club)/matches/actions'
import {
  MAX_MEMBER_MESSAGE_LENGTH,
  validateMemberMessageBody,
} from '@/lib/member-message-limits'
import { buttonPrimaryClassName, inputClassName } from '@/lib/event-labels'
import type { CuratedMatchDisplayState } from '@/lib/curated-match-lifecycle'
import type { CuratedMatchListItem } from '@/lib/load-curated-matches'

export default function CuratedMatchIntroButton({
  recommendationId,
  introStatus,
  recommendationStatus,
  conversationId,
  canMessage,
  displayState,
}: {
  recommendationId: string
  introStatus: CuratedMatchListItem['introStatus']
  recommendationStatus: string
  conversationId: string | null
  canMessage: boolean
  displayState: CuratedMatchDisplayState
}) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState(introStatus)
  const [isPending, startTransition] = useTransition()

  const effectiveState: CuratedMatchDisplayState =
    status === 'matched'
      ? 'connected'
      : status === 'pending'
        ? 'intro_requested'
        : displayState

  if (!canMessage && (effectiveState === 'new' || effectiveState === 'viewed')) {
    return (
      <p className="text-sm text-muted-foreground">
        Messaging and intros require an eligible paid membership.
      </p>
    )
  }

  if (effectiveState === 'connected') {
    const href = conversationId
      ? `/messages/${conversationId}`
      : '/messages'
    return (
      <Link href={href} className={buttonPrimaryClassName}>
        Open messages
      </Link>
    )
  }

  if (
    effectiveState === 'passed' ||
    effectiveState === 'declined' ||
    effectiveState === 'expired' ||
    recommendationStatus === 'passed' ||
    recommendationStatus === 'expired'
  ) {
    if (effectiveState === 'declined' && conversationId) {
      return (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            This member declined your message request.
          </p>
          <Link href={`/messages/${conversationId}`} className={buttonPrimaryClassName}>
            View thread
          </Link>
        </div>
      )
    }
    return null
  }

  if (effectiveState === 'intro_requested') {
    const href = conversationId ? `/messages/${conversationId}` : '/messages'
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Message request sent — waiting for them to accept or decline.
        </p>
        <Link href={href} className={buttonPrimaryClassName}>
          View request
        </Link>
      </div>
    )
  }

  const bodyValidationError = body.trim() ? validateMemberMessageBody(body) : null

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    setMessage('')
    const validationError = validateMemberMessageBody(body)
    if (validationError) {
      setMessage(validationError)
      return
    }

    startTransition(async () => {
      const result = await requestCuratedMatchIntro(recommendationId, body)
      if ('error' in result && result.error) {
        setMessage(result.error)
        return
      }
      setStatus('pending')
      setBody('')
      setMessage('Message request sent.')
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label className="grid gap-1.5 text-sm">
        <span className="font-medium text-foreground">Your opening message</span>
        <textarea
          value={body}
          onChange={(event) =>
            setBody(event.target.value.slice(0, MAX_MEMBER_MESSAGE_LENGTH))
          }
          rows={4}
          maxLength={MAX_MEMBER_MESSAGE_LENGTH}
          className={`${inputClassName} min-h-[6rem]`}
          placeholder="Introduce yourself and say why you would like to connect…"
          disabled={isPending}
        />
      </label>
      <button
        type="submit"
        disabled={isPending || !body.trim() || Boolean(bodyValidationError)}
        className={buttonPrimaryClassName}
      >
        {isPending ? 'Sending…' : 'Send message request'}
      </button>
      {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
    </form>
  )
}
