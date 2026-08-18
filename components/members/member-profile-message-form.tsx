'use client'

import { useId, useState, useTransition } from 'react'
import Link from 'next/link'
import Card from '@/components/ui/card'
import {
  buttonPrimaryClassName,
  inputClassName,
} from '@/lib/event-labels'
import {
  MAX_MEMBER_MESSAGE_LENGTH,
  validateMemberMessageBody,
} from '@/lib/member-message-limits'
import {
  MEMBER_MESSAGING_LOCKED_COPY,
  MEMBER_MESSAGING_UPGRADE_CTA,
  MEMBER_MESSAGING_UPGRADE_PATH,
  profileMessagingUiMode,
} from '@/lib/member-profile-messaging'

export type ProfileMessageSendResult =
  | { error: string }
  | { success: true; conversationId?: string }

/**
 * Presentational profile messaging UI. Callers supply `onSend` so server
 * actions stay out of this module (and unit tests).
 */
export default function MemberProfileMessageForm({
  firstName,
  canMessage,
  isSelf = false,
  onSend,
}: {
  firstName: string
  canMessage: boolean
  isSelf?: boolean
  onSend: (body: string) => Promise<ProfileMessageSendResult>
}) {
  const formId = useId()
  const textareaId = `${formId}-body`
  const [body, setBody] = useState('')
  const [feedback, setFeedback] = useState('')
  const [feedbackTone, setFeedbackTone] = useState<'success' | 'error'>(
    'success'
  )
  const [isPending, startTransition] = useTransition()

  const mode = profileMessagingUiMode({ isSelf, canMessage })
  if (mode === 'hidden') return null

  if (mode === 'upgrade') {
    return (
      <Card className="w-full border-accent/25 bg-accent-soft/20">
        <p className="eyebrow">Messaging</p>
        <h2 className="text-display mt-1 text-xl font-semibold">
          Message {firstName}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {MEMBER_MESSAGING_LOCKED_COPY}
        </p>
        <div className="mt-5">
          <Link
            href={MEMBER_MESSAGING_UPGRADE_PATH}
            className={`${buttonPrimaryClassName} inline-flex w-full justify-center sm:w-auto`}
          >
            {MEMBER_MESSAGING_UPGRADE_CTA}
          </Link>
        </div>
      </Card>
    )
  }

  const bodyValidationError = body.trim()
    ? validateMemberMessageBody(body)
    : null

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    setFeedback('')
    const validationError = validateMemberMessageBody(body)
    if (validationError) {
      setFeedbackTone('error')
      setFeedback(validationError)
      return
    }

    startTransition(async () => {
      const result = await onSend(body)
      if ('error' in result && result.error) {
        setFeedbackTone('error')
        setFeedback(result.error)
        return
      }
      setBody('')
      setFeedbackTone('success')
      setFeedback('Message request sent.')
    })
  }

  return (
    <Card className="w-full border-accent/25 bg-accent-soft/20">
      <p className="eyebrow">Messaging</p>
      <h2 className="text-display mt-1 text-xl font-semibold">
        Message {firstName}
      </h2>
      <form onSubmit={handleSubmit} className="mt-4 grid gap-3">
        <label htmlFor={textareaId} className="grid gap-1.5 text-sm">
          <span className="font-medium text-foreground">Your message</span>
          <textarea
            id={textareaId}
            name="message_body"
            value={body}
            onChange={(event) =>
              setBody(event.target.value.slice(0, MAX_MEMBER_MESSAGE_LENGTH))
            }
            rows={4}
            maxLength={MAX_MEMBER_MESSAGE_LENGTH}
            className={`${inputClassName} min-h-[6rem] w-full`}
            placeholder={`Write a message to ${firstName}…`}
            disabled={isPending}
            aria-invalid={Boolean(bodyValidationError)}
            aria-describedby={feedback ? `${formId}-feedback` : undefined}
          />
        </label>
        <button
          type="submit"
          disabled={
            isPending || !body.trim() || Boolean(bodyValidationError)
          }
          className={`${buttonPrimaryClassName} w-full sm:w-auto`}
        >
          {isPending ? 'Sending…' : 'Send message request'}
        </button>
        {feedback ? (
          <p
            id={`${formId}-feedback`}
            className={`text-sm ${
              feedbackTone === 'error' ? 'text-danger' : 'text-muted-foreground'
            }`}
            role={feedbackTone === 'error' ? 'alert' : undefined}
          >
            {feedback}
          </p>
        ) : null}
      </form>
    </Card>
  )
}
