'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  markVisibleConversationRead,
  sendMemberMessage,
} from '@/app/(club)/messages/actions'
import {
  bindConversationReadOnVisibility,
  isNearMessageBottom,
  latestJumpLabel,
  planConversationScroll,
  scrollBehaviorForJump,
  shouldMarkConversationRead,
  type MessageScrollSnapshot,
} from '@/lib/conversation-scroll'
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
  canMarkRead = false,
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
  canMarkRead?: boolean
  status?: 'pending' | 'accepted' | 'declined'
  viewerIsInitiator?: boolean
  recontactStatus?: RecontactStatus | null
}) {
  const [messages, setMessages] = useState(initialMessages)
  const [syncedMessages, setSyncedMessages] = useState(initialMessages)
  const [blockState, setBlockState] = useState(initialBlockState)
  const [syncedBlockState, setSyncedBlockState] = useState(initialBlockState)
  if (syncedMessages !== initialMessages) {
    setSyncedMessages(initialMessages)
    setMessages(initialMessages)
  }
  if (syncedBlockState !== initialBlockState) {
    setSyncedBlockState(initialBlockState)
    setBlockState(initialBlockState)
  }
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()
  const [awayFromLatest, setAwayFromLatest] = useState(false)
  const [unseenIncoming, setUnseenIncoming] = useState(0)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const snapshotRef = useRef<MessageScrollSnapshot | null>(null)
  const stickToBottomRef = useRef(true)
  const forceRevealRef = useRef(false)
  const programmaticRef = useRef(false)
  const markTokenRef = useRef<string | null>(null)
  const router = useRouter()
  const messageSignature = messages.map((message) => message.id).join('\n')

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

  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return

    const plan = planConversationScroll({
      previous: snapshotRef.current,
      messages,
      scrollHeight: scroller.scrollHeight,
      forceReveal: forceRevealRef.current,
    })
    forceRevealRef.current = false
    programmaticRef.current = true

    if (plan.action.type === 'pin') {
      scroller.scrollTop = scroller.scrollHeight
      stickToBottomRef.current = true
      setAwayFromLatest(false)
      setUnseenIncoming(0)
    } else if (plan.action.type === 'preserve-prepend') {
      scroller.scrollTop = plan.action.scrollTop
      stickToBottomRef.current = false
      setAwayFromLatest(true)
      if (plan.unseenIncoming > 0) {
        setUnseenIncoming((current) => current + plan.unseenIncoming)
      }
    } else if (plan.unseenIncoming > 0) {
      stickToBottomRef.current = false
      setAwayFromLatest(true)
      setUnseenIncoming((current) => current + plan.unseenIncoming)
    } else {
      stickToBottomRef.current = plan.stuckToBottom
    }

    snapshotRef.current = {
      firstId: messages[0]?.id ?? null,
      lastId: messages[messages.length - 1]?.id ?? null,
      scrollHeight: scroller.scrollHeight,
      scrollTop: scroller.scrollTop,
      stuckToBottom: stickToBottomRef.current,
    }

    requestAnimationFrame(() => {
      programmaticRef.current = false
    })
  }, [messageSignature, messages])

  useEffect(() => {
    const scroller = scrollerRef.current
    const content = contentRef.current
    if (!scroller || !content) return

    const pinIfAnchored = () => {
      if (!stickToBottomRef.current) return
      programmaticRef.current = true
      scroller.scrollTop = scroller.scrollHeight
      snapshotRef.current = snapshotRef.current
        ? {
            ...snapshotRef.current,
            scrollHeight: scroller.scrollHeight,
            scrollTop: scroller.scrollTop,
            stuckToBottom: true,
          }
        : snapshotRef.current
      requestAnimationFrame(() => {
        programmaticRef.current = false
      })
    }

    const observer = new ResizeObserver(pinIfAnchored)
    observer.observe(content)
    observer.observe(scroller)
    return () => observer.disconnect()
  }, [conversationId])

  const markIfViewingLatest = useCallback(() => {
    const hasUnreadIncoming = messages.some(
      (message) => message.isUnread && !message.isOwn
    )
    if (
      !shouldMarkConversationRead({
        canMarkRead,
        viewingLatest: stickToBottomRef.current,
        hasUnreadIncoming,
        documentVisible: document.visibilityState === 'visible',
      })
    ) {
      return
    }

    if (markTokenRef.current === messageSignature) return
    markTokenRef.current = messageSignature
    void markVisibleConversationRead(conversationId).then((result) => {
      if (!result.ok) markTokenRef.current = null
    })
  }, [canMarkRead, conversationId, messageSignature, messages])

  useEffect(() => {
    markIfViewingLatest()
  }, [markIfViewingLatest])

  useEffect(() => {
    return bindConversationReadOnVisibility({
      target: document,
      conversationId,
      getState: () => ({
        canMarkRead,
        viewingLatest: stickToBottomRef.current,
        hasUnreadIncoming: messages.some(
          (message) => message.isUnread && !message.isOwn
        ),
      }),
      markRead: () => {
        markIfViewingLatest()
      },
    })
  }, [canMarkRead, conversationId, markIfViewingLatest, messages])

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
      forceRevealRef.current = true
      stickToBottomRef.current = true
      router.refresh()
    })
  }

  const handleScroll = () => {
    if (programmaticRef.current) return
    const scroller = scrollerRef.current
    if (!scroller) return
    const nearBottom = isNearMessageBottom(scroller)
    stickToBottomRef.current = nearBottom
    setAwayFromLatest(!nearBottom)
    if (nearBottom) {
      setUnseenIncoming(0)
      markIfViewingLatest()
    }
    snapshotRef.current = snapshotRef.current
      ? {
          ...snapshotRef.current,
          scrollHeight: scroller.scrollHeight,
          scrollTop: scroller.scrollTop,
          stuckToBottom: nearBottom,
        }
      : snapshotRef.current
  }

  const jumpToLatest = () => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches
    const behavior = scrollBehaviorForJump(reducedMotion)
    stickToBottomRef.current = true
    setAwayFromLatest(false)
    setUnseenIncoming(0)
    markIfViewingLatest()
    programmaticRef.current = true
    scroller.scrollTo({ top: scroller.scrollHeight, behavior })
    const release = () => {
      programmaticRef.current = false
    }
    if (behavior === 'auto') {
      requestAnimationFrame(release)
    } else {
      scroller.addEventListener('scrollend', release, { once: true })
      window.setTimeout(release, 1500)
    }
    snapshotRef.current = snapshotRef.current
      ? {
          ...snapshotRef.current,
          scrollTop: scroller.scrollHeight,
          stuckToBottom: true,
        }
      : snapshotRef.current
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-card shadow-sm">
      <div className="shrink-0 border-b border-border px-5 py-4">
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

      <div className="relative min-h-40 flex-1">
      <div
        ref={scrollerRef}
        data-message-scroll
        onScroll={handleScroll}
        className="absolute inset-0 overflow-y-auto overscroll-contain px-5 py-4"
      >
        <div ref={contentRef} className="space-y-4">
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
        </div>
      </div>
      {awayFromLatest ? (
        <button
          type="button"
          data-message-jump
          className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground shadow-md hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          onClick={jumpToLatest}
        >
          {latestJumpLabel(unseenIncoming)}
        </button>
      ) : null}
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
        <div className="shrink-0 border-t border-border px-5 py-4 text-sm text-muted-foreground">
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
          className="shrink-0 border-t border-border px-5 py-4"
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
