'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  blockMemberInConversation,
  reportConversation,
} from '@/app/(club)/messages/actions'
import {
  CONVERSATION_REPORT_REASONS,
  type ConversationBlockState,
  type ConversationReportReason,
  type ConversationReportState,
} from '@/lib/member-messaging-safety'
import { buttonSecondaryClassName, inputClassName } from '@/lib/event-labels'

function reportStatusCopy(
  status: ConversationReportState['status']
): string | null {
  switch (status) {
    case 'pending':
      return 'Your report is with our team for review. You can continue reading earlier messages unless you block this member.'
    case 'reviewed':
      return 'Our team reviewed your report. Contact support if you still have safety concerns.'
    case 'dismissed':
      return 'Our team closed your report without further action. You can still block this member if needed.'
    default:
      return null
  }
}

export default function MessageThreadControls({
  conversationId,
  otherUserName,
  initialBlockState,
  initialReportState,
  onBlockStateChange,
}: {
  conversationId: string
  otherUserName: string
  initialBlockState: ConversationBlockState
  initialReportState: ConversationReportState
  onBlockStateChange?: (state: ConversationBlockState) => void
}) {
  const router = useRouter()
  const [blockState, setBlockState] = useState(initialBlockState)
  const [reportState, setReportState] = useState(initialReportState)
  const [showReportForm, setShowReportForm] = useState(false)
  const [reason, setReason] = useState<ConversationReportReason>('safety')
  const [details, setDetails] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    setReportState(initialReportState)
  }, [initialReportState])

  const hasOpenReport = reportState.status !== 'none'
  const reportCopy = reportStatusCopy(reportState.status)

  const runBlock = () => {
    setError('')
    setMessage('')
    const confirmed = window.confirm(
      `Block ${otherUserName}? They will not be able to send you messages in this conversation.`
    )
    if (!confirmed) return

    startTransition(async () => {
      const result = await blockMemberInConversation(conversationId)
      if (result.error) {
        setError(result.error)
        return
      }
      const nextBlockState = {
        isBlocked: true,
        blockedByViewer: true,
        blockedByOther: false,
      }
      setBlockState(nextBlockState)
      onBlockStateChange?.(nextBlockState)
      setMessage(
        result.alreadyBlocked
          ? `${otherUserName} is already blocked.`
          : `You blocked ${otherUserName}. This conversation is closed to new messages.`
      )
      router.refresh()
    })
  }

  const runReport = () => {
    setError('')
    setMessage('')
    startTransition(async () => {
      const result = await reportConversation({
        conversationId,
        reason,
        details,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      setReportState({ status: 'pending' })
      setShowReportForm(false)
      setDetails('')
      setMessage(
        result.alreadyReported
          ? 'Our team already has a pending report for this conversation.'
          : 'Report submitted. Our team will review this conversation.'
      )
      router.refresh()
    })
  }

  return (
    <div className="border-b border-border px-5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Private conversation with {otherUserName}
        </p>
        <div className="flex flex-wrap gap-2">
          {!blockState.isBlocked ? (
            <>
              <button
                type="button"
                onClick={() => setShowReportForm((current) => !current)}
                disabled={isPending || hasOpenReport}
                className={buttonSecondaryClassName}
              >
                {reportState.status === 'pending'
                  ? 'Reported'
                  : reportState.status === 'reviewed'
                    ? 'Report reviewed'
                    : reportState.status === 'dismissed'
                      ? 'Report closed'
                      : 'Report'}
              </button>
              <button
                type="button"
                onClick={runBlock}
                disabled={isPending}
                className={buttonSecondaryClassName}
              >
                Block member
              </button>
            </>
          ) : null}
        </div>
      </div>

      {blockState.isBlocked ? (
        <p className="mt-3 rounded-lg border border-warning/30 bg-warning-soft/30 px-3 py-2 text-sm text-muted-foreground">
          {blockState.blockedByViewer
            ? `You blocked ${otherUserName}. New messages are disabled in this conversation.`
            : `${otherUserName} is unavailable for messaging.`}
        </p>
      ) : null}

      {reportCopy && !showReportForm ? (
        <p className="mt-3 text-xs text-muted-foreground">{reportCopy}</p>
      ) : null}

      {showReportForm && !blockState.isBlocked && !hasOpenReport ? (
        <div className="mt-3 space-y-3 rounded-lg border border-border bg-surface/50 p-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-foreground">
              Reason for report
            </span>
            <select
              value={reason}
              onChange={(event) =>
                setReason(event.target.value as ConversationReportReason)
              }
              className={inputClassName}
              disabled={isPending}
            >
              {CONVERSATION_REPORT_REASONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-foreground">
              Details (optional)
            </span>
            <textarea
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              rows={3}
              maxLength={1000}
              className={`${inputClassName} min-h-[4.5rem]`}
              placeholder="Share context that will help our team review this conversation."
              disabled={isPending}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={runReport}
              disabled={isPending}
              className={buttonSecondaryClassName}
            >
              {isPending ? 'Submitting…' : 'Submit report'}
            </button>
            <button
              type="button"
              onClick={() => setShowReportForm(false)}
              disabled={isPending}
              className={buttonSecondaryClassName}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {message ? (
        <p className="mt-3 text-sm text-muted-foreground">{message}</p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
    </div>
  )
}
