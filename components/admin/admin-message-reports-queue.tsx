'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  adminBlockReportedMember,
  moderateMessageReport,
  suspendReportedMemberMessaging,
  unsuspendReportedMemberMessaging,
} from '@/app/(club)/admin/message-reports/actions'
import Badge from '@/components/ui/badge'
import {
  buttonPrimaryClassName,
  buttonSecondaryClassName,
  inputClassName,
} from '@/lib/event-labels'
import type { MessageReportQueueItem } from '@/lib/load-message-reports-queue'

function statusBadgeVariant(
  status: string
): 'accent' | 'success' | 'muted' | 'warning' {
  switch (status) {
    case 'pending':
      return 'warning'
    case 'reviewed':
      return 'success'
    case 'dismissed':
      return 'muted'
    default:
      return 'accent'
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return 'Pending review'
    case 'reviewed':
      return 'Reviewed'
    case 'dismissed':
      return 'Dismissed'
    default:
      return status
  }
}

export default function AdminMessageReportsQueue({
  items,
  focusReportId = null,
}: {
  items: MessageReportQueueItem[]
  focusReportId?: string | null
}) {
  const router = useRouter()
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()
  const [highlightReportId, setHighlightReportId] = useState<string | null>(
    focusReportId
  )

  useEffect(() => {
    if (!focusReportId) {
      return
    }

    const target = document.getElementById(`report-${focusReportId}`)
    if (!target) {
      return
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightReportId(focusReportId)

    const timeout = window.setTimeout(() => {
      setHighlightReportId(null)
    }, 4000)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [focusReportId, items])

  const runAction = (reportId: string, action: 'reviewed' | 'dismissed') => {
    setMessage('')
    startTransition(async () => {
      const result = await moderateMessageReport({
        reportId,
        action,
        adminNotes: notes[reportId],
      })

      if (result.error) {
        setMessage(result.error)
        return
      }

      router.refresh()
    })
  }

  const runSuspend = (reportId: string) => {
    setMessage('')
    const confirmed = window.confirm(
      'Suspend messaging for the reported member? They will be unable to send messages until staff restores access.'
    )
    if (!confirmed) return

    startTransition(async () => {
      const result = await suspendReportedMemberMessaging({
        reportId,
        adminNotes: notes[reportId],
        markReportReviewed: true,
      })

      if (result.error) {
        setMessage(result.error)
        return
      }

      setMessage('Messaging suspended for the reported member.')
      router.refresh()
    })
  }

  const runAdminBlock = (reportId: string) => {
    setMessage('')
    const confirmed = window.confirm(
      'Block the reported member on behalf of the reporter? This closes the conversation to new messages between them.'
    )
    if (!confirmed) return

    startTransition(async () => {
      const result = await adminBlockReportedMember({
        reportId,
        adminNotes: notes[reportId],
      })

      if (result.error) {
        setMessage(result.error)
        return
      }

      setMessage(
        result.alreadyBlocked
          ? 'A block already exists between these members.'
          : 'Admin-initiated block recorded for this conversation.'
      )
      router.refresh()
    })
  }

  const runUnsuspend = (reportId: string) => {
    setMessage('')
    const confirmed = window.confirm(
      'Restore messaging access for the reported member? They will be able to send messages again.'
    )
    if (!confirmed) return

    startTransition(async () => {
      const result = await unsuspendReportedMemberMessaging({
        reportId,
        adminNotes: notes[reportId],
      })

      if (result.error) {
        setMessage(result.error)
        return
      }

      setMessage('Messaging access restored for the reported member.')
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {message ? <p className="text-sm text-danger">{message}</p> : null}

      {items.map((item) => {
        const isReviewable = item.status === 'pending'
        const reportedSuspended = item.reportedMember?.messagingSuspended ?? false
        const showEnforcementPanel = isReviewable || reportedSuspended

        return (
          <article
            key={item.id}
            id={`report-${item.id}`}
            className={`rounded-xl border bg-card p-5 shadow-sm transition ${
              highlightReportId === item.id
                ? 'border-accent ring-2 ring-accent/40'
                : 'border-border'
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-display text-lg font-semibold">
                  {item.reasonLabel}
                </h2>
                <p className="text-sm text-muted-foreground">
                  Reported {new Date(item.createdAt).toLocaleString()}
                </p>
              </div>
              <Badge variant={statusBadgeVariant(item.status)}>
                {statusLabel(item.status)}
              </Badge>
            </div>

            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-surface/50 p-3">
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Reporter
                </dt>
                <dd className="mt-1">
                  <Link
                    href={`/members/${item.reporter.id}`}
                    className="font-medium text-accent underline"
                  >
                    {item.reporter.name}
                  </Link>
                  {item.reporter.email ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.reporter.email}
                    </p>
                  ) : null}
                </dd>
              </div>
              <div className="rounded-lg border border-border bg-surface/50 p-3">
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Reported member
                </dt>
                <dd className="mt-1">
                  {item.reportedMember ? (
                    <>
                      <Link
                        href={`/members/${item.reportedMember.id}`}
                        className="font-medium text-accent underline"
                      >
                        {item.reportedMember.name}
                      </Link>
                      {item.reportedMember.messagingSuspended ? (
                        <p className="mt-1 text-xs font-medium text-warning">
                          Messaging suspended
                        </p>
                      ) : null}
                      {item.reportedMember.email ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.reportedMember.email}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
              <div className="rounded-lg border border-border bg-surface/50 p-3 sm:col-span-2">
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Participants
                </dt>
                <dd className="mt-1 flex flex-wrap gap-3">
                  {item.participants.map((participant) => (
                    <span key={participant.id} className="inline-flex items-center gap-2">
                      <Link
                        href={`/members/${participant.id}`}
                        className="text-accent underline"
                      >
                        {participant.name}
                      </Link>
                      {participant.messagingSuspended ? (
                        <span className="text-[10px] font-medium text-warning">
                          Suspended
                        </span>
                      ) : null}
                    </span>
                  ))}
                </dd>
              </div>
              <div className="rounded-lg border border-border bg-surface/50 p-3">
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Conversation
                </dt>
                <dd className="mt-1 break-all font-mono text-xs text-muted-foreground">
                  {item.conversationId}
                </dd>
              </div>
              <div className="rounded-lg border border-border bg-surface/50 p-3">
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Block state
                </dt>
                <dd className="mt-1 text-sm text-muted-foreground">
                  {item.blockState.isBlocked
                    ? item.blockState.blockedByReporter
                      ? 'Reporter blocked the reported member'
                      : item.blockState.blockedByReported
                        ? 'Reported member blocked the reporter'
                        : 'Blocked between participants'
                    : 'No block on record'}
                </dd>
              </div>
            </dl>

            {item.details ? (
              <div className="mt-4 rounded-lg border border-border bg-surface/50 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Member details
                </p>
                <p className="mt-2 text-sm leading-relaxed text-foreground">
                  {item.details}
                </p>
              </div>
            ) : null}

            <div className="mt-4 rounded-lg border border-border bg-surface/50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Recent messages
              </p>
              {item.messagePreview.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  No messages in this conversation yet.
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {item.messagePreview.map((message, index) => (
                    <li
                      key={`${message.createdAt}-${index}`}
                      className="border-l-2 border-border pl-3"
                    >
                      <p className="text-xs font-medium text-muted-foreground">
                        {message.senderLabel}
                        <span className="ml-2 font-normal text-muted">
                          {new Date(message.createdAt).toLocaleString()}
                        </span>
                      </p>
                      <p
                        className={`mt-1 text-sm leading-relaxed ${
                          message.isSystem
                            ? 'italic text-muted-foreground'
                            : 'text-foreground'
                        }`}
                      >
                        {message.body}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                Admins cannot open member thread URLs directly. Use the preview
                above and member profile links for review.
              </p>
            </div>

            {item.adminNotes && !isReviewable ? (
              <p className="mt-4 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Staff notes:</span>{' '}
                {item.adminNotes}
                {item.adminReviewedAt ? (
                  <span className="block text-xs text-muted">
                    Reviewed {new Date(item.adminReviewedAt).toLocaleString()}
                  </span>
                ) : null}
              </p>
            ) : null}

            {showEnforcementPanel ? (
              <div className="mt-4 space-y-3 border-t border-border pt-4">
                {(isReviewable || reportedSuspended) && (
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-foreground">
                      Internal staff notes (optional)
                    </span>
                    <textarea
                      value={notes[item.id] ?? ''}
                      onChange={(event) =>
                        setNotes((current) => ({
                          ...current,
                          [item.id]: event.target.value,
                        }))
                      }
                      rows={2}
                      className={`${inputClassName} min-h-[4.5rem]`}
                      placeholder="Document review outcomes, suspension rationale, or why access was restored."
                    />
                  </label>
                )}
                {isReviewable ? (
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => runAction(item.id, 'reviewed')}
                      className={buttonPrimaryClassName}
                    >
                      {isPending ? 'Saving…' : 'Mark reviewed'}
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => runAction(item.id, 'dismissed')}
                      className={buttonSecondaryClassName}
                    >
                      Dismiss / no action
                    </button>
                    {item.reportedMember ? (
                      <>
                        <button
                          type="button"
                          disabled={
                            isPending || item.reportedMember.messagingSuspended
                          }
                          onClick={() => runSuspend(item.id)}
                          className={buttonSecondaryClassName}
                        >
                          {item.reportedMember.messagingSuspended
                            ? 'Already suspended'
                            : 'Suspend messaging'}
                        </button>
                        <button
                          type="button"
                          disabled={isPending || item.blockState.blockedByReporter}
                          onClick={() => runAdminBlock(item.id)}
                          className={buttonSecondaryClassName}
                        >
                          {item.blockState.blockedByReporter
                            ? 'Already blocked'
                            : 'Block for reporter'}
                        </button>
                      </>
                    ) : null}
                  </div>
                ) : null}
                {item.reportedMember && reportedSuspended ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => runUnsuspend(item.id)}
                      className={buttonPrimaryClassName}
                    >
                      {isPending ? 'Saving…' : 'Restore messaging'}
                    </button>
                    <p className="text-xs text-muted-foreground">
                      This member&apos;s messaging is currently suspended.
                    </p>
                  </div>
                ) : item.reportedMember && !isReviewable ? (
                  <p className="text-xs text-muted-foreground">
                    Messaging is active for the reported member.
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  Suspend messaging disables send and report actions. Restore
                  messaging reverses a suspension. Block for reporter closes
                  this conversation between the two members. All actions are
                  logged in the{' '}
                  <Link
                    href="/admin/moderation-actions"
                    className="text-accent underline"
                  >
                    moderation audit
                  </Link>
                  .
                </p>
              </div>
            ) : null}
          </article>
        )
      })}
    </div>
  )
}
