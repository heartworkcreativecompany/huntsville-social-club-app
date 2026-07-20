'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { sendMemberMessage } from '@/app/(club)/messages/actions'
import MessageThreadControls from '@/components/messages/message-thread-controls'
import MessageRequestControls from '@/components/messages/message-request-controls'
import RecontactReconsiderControls from '@/components/messages/recontact-reconsider-controls'
import RecontactRequestControls from '@/components/messages/recontact-request-controls'
import RecontactRetryForm from '@/components/messages/recontact-retry-form'
import {
  MAX_MEMBER_MESSAGE_LENGTH,
  validateMemberMessageBody,
} from '@/lib/member-message-limits'
import {
  conversationRequestStateLabel,
  recontactStateLabel,
} from '@/lib/message-request-states'
import type { RecontactStatus } from '@/lib/message-recontact-states'
import type {
  ConversationBlockState,
  ConversationReportState,
} from '@/lib/member-messaging-safety'
import { inputClassName, buttonPrimaryClassName } from '@/lib/event-labels'
import type { ThreadMessage } from '@/lib/member-messages'

const THREAD_POLL_INTERVAL_MS = 15_000

function formatMessageTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function hasOnlySystemMessages(messages: ThreadMessage[]): boolean {
  return messages.length > 0 && messages.every((message) => message.isSystem)
}

export default function MessageThread({
  conversationId,
  otherUserName,
  initialMessages,
  initialUnreadCount,
  initialBlockState,
  initialReportState,
  messagingSuspended = false,
  status = 'accepted',
  viewerIsInitiator = false,
  recontactStatus = null,
}: {
  conversationId: string
  otherUserName: string
  initialMessages: ThreadMessage[]
  initialUnreadCount: number
  initialBlockState: ConversationBlockState
  initialReportState: ConversationReportState
  messagingSuspended?: boolean
  status?: 'pending' | 'accepted' | 'declined'
  viewerIsInitiator?: boolean
  recontactStatus?: RecontactStatus | null
}) {
  const [messages, setMessages] = useState(initialMessages)
  const [blockState, setBlockState] = useState(initialBlockState)
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()
  const bottomRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  const isBlocked = blockState.isBlocked
  const isPendingRequest = status === 'pending'
  const isDeclined = status === 'declined'
  const recontactLabel = recontactStateLabel({
    recontactStatus,
    viewerIsInitiator,
  })
  const showRecontactRequest =
    isDeclined && viewerIsInitiator && recontactStatus == null
  const showRecontactReconsider =
    recontactStatus === 'awaiting_recipient' && !viewerIsInitiator
  const showRecontactRetry =
    isDeclined && viewerIsInitiator && recontactStatus === 'allowed'
  const composeDisabled =
    isBlocked ||
    messagingSuspended ||
    isPendingRequest ||
    (isDeclined && !showRecontactRetry) ||
    showRecontactRetry
  const remainingChars = MAX_MEMBER_MESSAGE_LENGTH - body.length
  const bodyValidationError = body.trim()
    ? validateMemberMessageBody(body)
    : null

  useEffect(() => {
    setMessages(initialMessages)
  }, [initialMessages])

  useEffect(() => {
    setBlockState(initialBlockState)
  }, [initialBlockState])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        router.refresh()
      }
    }, THREAD_POLL_INTERVAL_MS)

    return () => window.clearInterval(intervalId)
  }, [router])

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    const validationError = validateMemberMessageBody(body)
    if (validationError) {
      setError(validationError)
      return
    }

    startTransition(async () => {
      const result = await sendMemberMessage({ conversationId, body })
      if (result.error) {
        setError(result.error)
        return
      }

      setBody('')
      router.refresh()
    })
  }

  return (
    <div className="flex min-h-[28rem] flex-col rounded-xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-5 py-4">
        <p className="eyebrow">Conversation</p>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-display text-lg font-semibold">{otherUserName}</h2>
          {status !== 'accepted' && !recontactLabel ? (
            <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[10px] font-medium text-warning">
              {conversationRequestStateLabel({
                status,
                viewerIsInitiator,
              })}
            </span>
          ) : null}
          {initialUnreadCount > 0 ? (
            <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">
              {initialUnreadCount} unread
            </span>
          ) : null}
        </div>
      </div>

      {!messagingSuspended && status === 'accepted' ? (
        <MessageThreadControls
          conversationId={conversationId}
          otherUserName={otherUserName}
          initialBlockState={initialBlockState}
          initialReportState={initialReportState}
          onBlockStateChange={setBlockState}
        />
      ) : null}

      {isPendingRequest && !viewerIsInitiator ? (
        <MessageRequestControls conversationId={conversationId} />
      ) : null}

      {showRecontactReconsider ? (
        <RecontactReconsiderControls
          conversationId={conversationId}
          requesterName={otherUserName}
        />
      ) : null}

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {messages.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-surface/40 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
            <p className="font-medium text-foreground">No messages yet</p>
          </div>
        ) : null}

        {isPendingRequest && viewerIsInitiator ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            Your message request is waiting for {otherUserName} to accept or
            decline. You can send more messages after they accept.
          </p>
        ) : null}

        {isDeclined ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {viewerIsInitiator
              ? recontactStatus === 'allowed'
                ? `Use the form below to send one more message request to ${otherUserName}.`
                : recontactStatus === 'requested' ||
                    recontactStatus === 'awaiting_recipient'
                  ? 'Your recontact review is in progress. We will notify you of the outcome.'
                  : recontactStatus === 'denied' || recontactStatus === 'consumed'
                    ? `${otherUserName} is not available for another message request.`
                    : `${otherUserName} declined your message request.`
              : 'You declined this message request. This thread is closed.'}
          </p>
        ) : null}

        {hasOnlySystemMessages(messages) ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            The club welcomed you both to this private thread. Send the first
            message when you are ready.
          </p>
        ) : null}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`max-w-[85%] ${
              message.isSystem
                ? 'mx-auto text-center'
                : message.isOwn
                  ? 'ml-auto text-right'
                  : ''
            }`}
          >
            {message.isUnread && !message.isOwn ? (
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-accent">
                New
              </p>
            ) : null}
            <p
              className={`text-xs font-medium ${
                message.isSystem ? 'text-accent' : 'text-muted-foreground'
              }`}
            >
              {message.isSystem
                ? message.senderLabel
                : message.isOwn
                  ? 'You'
                  : message.senderLabel}
            </p>
            <div
              className={`mt-1 rounded-2xl px-4 py-2 text-sm leading-relaxed ${
                message.isSystem
                  ? 'border border-dashed border-accent/30 bg-accent-soft/20 text-foreground'
                  : message.isOwn
                    ? 'bg-accent text-accent-foreground'
                    : 'bg-surface-elevated text-foreground'
              }`}
            >
              {message.body}
            </div>
            <time
              className="mt-1 block text-[11px] text-muted"
              dateTime={message.createdAt}
            >
              {formatMessageTime(message.createdAt)}
            </time>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {showRecontactRetry ? (
        <RecontactRetryForm
          conversationId={conversationId}
          otherUserName={otherUserName}
        />
      ) : null}

      {showRecontactRequest ? (
        <RecontactRequestControls conversationId={conversationId} />
      ) : null}

      {composeDisabled && !showRecontactRetry ? (
        <div className="border-t border-border px-5 py-4 text-sm text-muted-foreground">
          {messagingSuspended
            ? 'Messaging is suspended on your account.'
            : isPendingRequest && !viewerIsInitiator
              ? 'Accept or decline this request to continue.'
              : isPendingRequest
                ? 'Waiting for the recipient to accept your request.'
                : isDeclined
                  ? recontactStatus === 'requested' ||
                    recontactStatus === 'awaiting_recipient'
                    ? 'Recontact review in progress.'
                    : 'This conversation is closed.'
                  : 'Messaging is disabled in this conversation.'}
        </div>
      ) : !showRecontactRetry ? (
        <form
          onSubmit={handleSubmit}
          className="border-t border-border px-5 py-4"
        >
          <label className="block text-sm">
            <span className="mb-2 block font-medium text-foreground">Message</span>
            <textarea
              value={body}
              onChange={(event) =>
                setBody(event.target.value.slice(0, MAX_MEMBER_MESSAGE_LENGTH))
              }
              rows={3}
              maxLength={MAX_MEMBER_MESSAGE_LENGTH}
              className={`${inputClassName} min-h-[5rem]`}
              placeholder={`Message ${otherUserName}…`}
              disabled={isPending}
            />
          </label>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className={remainingChars < 100 ? 'text-warning' : undefined}>
              {remainingChars} characters remaining
            </span>
            <span>Updates every 15 seconds while this tab is open</span>
          </div>
          {bodyValidationError && body.trim() ? (
            <p className="mt-2 text-sm text-danger">{bodyValidationError}</p>
          ) : null}
          {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
          <button
            type="submit"
            disabled={
              isPending || !body.trim() || Boolean(bodyValidationError)
            }
            className={`${buttonPrimaryClassName} mt-3`}
          >
            {isPending ? 'Sending…' : 'Send message'}
          </button>
        </form>
      ) : null}
    </div>
  )
}
