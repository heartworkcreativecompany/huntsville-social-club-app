'use client'

import { useId, useState, useTransition } from 'react'
import Card from '@/components/ui/card'
import IdentityVerificationEntryLink from '@/components/profile/identity-verification-entry-link'
import { buttonPrimaryClassName, inputClassName } from '@/lib/event-labels'
import {
  MAX_MEMBER_MESSAGE_LENGTH,
  validateMemberMessageBody,
} from '@/lib/member-message-limits'
import {
  MEMBER_MESSAGING_MUTUAL_REQUIRED_COPY,
  PROFILE_IDENTITY_REQUIRED_COPY,
  PROFILE_IDENTITY_UNAVAILABLE_COPY,
  profileMessagingUiMode,
} from '@/lib/member-profile-messaging'
import type { AcceptedIdentityStatus } from '@/lib/identity-verification'

export type ProfileMessageSendResult =
  | { error: string }
  | { success: true; conversationId?: string }

/**
 * Presentational profile messaging UI. Callers supply `onSend` so server
 * actions stay out of this module (and unit tests).
 */
export default function MemberProfileMessageForm({
  firstName,
  senderIdentity,
  recipientIdentity,
  isSelf = false,
  onSend,
}: {
  firstName: string
  senderIdentity: AcceptedIdentityStatus
  recipientIdentity: AcceptedIdentityStatus
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

  const mode = profileMessagingUiMode({
    isSelf,
    senderIdentity,
    recipientIdentity,
  })
  if (mode === 'hidden') return null

  if (mode === 'identity_required' || mode === 'identity_unavailable') {
    return (
      <Card className="w-full border-accent/25 bg-accent-soft/20">
        <p className="eyebrow">Messaging</p>
        <h2 className="text-display mt-1 text-xl font-semibold">
          Message {firstName}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {mode === 'identity_required'
            ? PROFILE_IDENTITY_REQUIRED_COPY
            : PROFILE_IDENTITY_UNAVAILABLE_COPY}
        </p>
        {mode === 'identity_required' ? (
          <div className="mt-5">
            <IdentityVerificationEntryLink className={`${buttonPrimaryClassName} inline-flex w-full justify-center sm:w-auto`} />
          </div>
        ) : null}
      </Card>
    )
  }

  if (mode === 'unavailable') {
    return (
      <Card className="w-full border-accent/25 bg-accent-soft/20">
        <p className="eyebrow">Messaging</p>
        <h2 className="text-display mt-1 text-xl font-semibold">
          Message {firstName}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {MEMBER_MESSAGING_MUTUAL_REQUIRED_COPY}
        </p>
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
