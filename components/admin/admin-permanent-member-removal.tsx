'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  permanentlyRemoveMemberAction,
  restoreRemovedMemberAction,
} from '@/app/(club)/admin/users/[id]/actions'
import {
  REMOVAL_REASON_CATEGORIES,
  RESTORE_DOES_NOT_RESTORE_COPY,
  isRemovalReasonCategory,
  type PaidTicketDecision,
  type RemovalReasonCategory,
} from '@/lib/member-removal'
import { buttonPrimaryClassName, inputClassName, textareaClassName } from '@/lib/event-labels'

type AdminPermanentMemberRemovalProps = {
  memberId: string
  memberName: string
  isSelf: boolean
  isAdminTarget: boolean
  removed: boolean
  removalCategory: string | null
  followUp: string[]
  paidTickets: PaidTicketDecision[]
}

function formatAmount(cents: number): string {
  return `$${(Math.max(0, cents) / 100).toFixed(2)}`
}

function formatWhen(iso: string): string {
  const parsed = Date.parse(iso)
  if (Number.isNaN(parsed)) return 'Date unavailable'
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Chicago',
  }).format(new Date(parsed))
}

export default function AdminPermanentMemberRemoval({
  memberId,
  memberName,
  isSelf,
  isAdminTarget,
  removed,
  removalCategory,
  followUp,
  paidTickets,
}: AdminPermanentMemberRemovalProps) {
  const router = useRouter()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [mode, setMode] = useState<'remove' | 'restore' | null>(null)
  const [category, setCategory] = useState<RemovalReasonCategory | ''>('')
  const [note, setNote] = useState('')
  const [confirmationText, setConfirmationText] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!mode) return
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [mode])

  const closeDialog = () => {
    setMode(null)
    setConfirmationText('')
    setErrorMessage('')
    dialogRef.current?.close()
  }

  const blockedReason = isSelf
    ? 'You cannot remove your own account.'
    : isAdminTarget
      ? 'Administrator accounts cannot be removed.'
      : null

  const canRemove =
    !removed &&
    !blockedReason &&
    category !== '' &&
    confirmationText.trim() === 'REMOVE' &&
    !isPending

  const canRestore =
    removed &&
    note.trim().length > 0 &&
    confirmationText.trim() === 'RESTORE' &&
    !isPending

  const submitRemoval = () => {
    if (!canRemove || !isRemovalReasonCategory(category)) return
    setErrorMessage('')
    startTransition(async () => {
      const result = await permanentlyRemoveMemberAction({
        memberId,
        category,
        internalNote: note,
        confirmationText,
      })
      if ('error' in result && result.error) {
        setErrorMessage(result.error)
        return
      }
      closeDialog()
      setSuccessMessage(`${memberName} was removed.`)
      router.refresh()
    })
  }

  const submitRestore = () => {
    if (!canRestore) return
    setErrorMessage('')
    startTransition(async () => {
      const result = await restoreRemovedMemberAction({
        memberId,
        note,
        confirmationText,
      })
      if ('error' in result && result.error) {
        setErrorMessage(result.error)
        return
      }
      closeDialog()
      setNote('')
      setSuccessMessage(`${memberName} can sign in again.`)
      router.refresh()
    })
  }

  return (
    <section className="grid gap-4 rounded-2xl border border-border bg-surface p-5">
      <div>
        <h3 className="text-display text-base font-semibold">Permanent removal</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {removed
            ? `${memberName} is removed.`
            : 'Remove a member who broke the club rules. This is separate from deleting an account.'}
        </p>
        {removalCategory ? (
          <p className="mt-2 text-sm text-foreground">Reason: {removalCategory}</p>
        ) : null}
      </div>

      {followUp.map((line) => (
        <p
          key={line}
          role="status"
          className="rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          {line}
        </p>
      ))}

      {paidTickets.length > 0 ? (
        <div>
          <h4 className="text-sm font-semibold text-foreground">Needs refund decision</h4>
          <ul className="mt-2 grid gap-2">
            {paidTickets.map((ticket) => (
              <li
                key={`${ticket.eventId}-${ticket.eventStartsAt}`}
                className="text-sm text-foreground"
              >
                {ticket.eventTitle}. {formatAmount(ticket.amountCents)}. {formatWhen(ticket.eventStartsAt)}.
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-muted-foreground">
            Paid tickets are not refunded automatically.
          </p>
        </div>
      ) : null}

      {removed ? (
        <p className="text-sm text-muted-foreground">{RESTORE_DOES_NOT_RESTORE_COPY}</p>
      ) : null}

      {blockedReason && !removed ? (
        <p className="text-sm text-muted-foreground">{blockedReason}</p>
      ) : null}

      {successMessage ? (
        <p className="text-sm text-success">{successMessage}</p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {removed ? (
          <button
            type="button"
            className={buttonPrimaryClassName}
            onClick={() => {
              setErrorMessage('')
              setConfirmationText('')
              setMode('restore')
            }}
          >
            Restore member
          </button>
        ) : (
          <button
            type="button"
            disabled={Boolean(blockedReason)}
            onClick={() => {
              setErrorMessage('')
              setConfirmationText('')
              setMode('remove')
            }}
            className="inline-flex w-fit rounded-lg border border-danger/40 px-4 py-2 text-sm font-medium text-danger hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-60"
          >
            Remove member
          </button>
        )}
      </div>

      {mode ? (
        <dialog
          ref={dialogRef}
          className="w-[min(100vw-2rem,32rem)] max-w-lg rounded-xl border border-border bg-surface p-0 text-foreground shadow-lg backdrop:bg-foreground/40"
          onClose={closeDialog}
        >
          <form
            className="grid gap-4 p-6"
            onSubmit={(event) => {
              event.preventDefault()
              if (mode === 'remove') submitRemoval()
              if (mode === 'restore') submitRestore()
            }}
          >
            {mode === 'remove' ? (
              <>
                <div>
                  <h2 className="text-display text-lg font-semibold text-danger">
                    Remove member
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {memberName} will be hidden from other members. Messaging will be
                    suspended. Upcoming free event RSVPs will be cancelled. An active
                    membership subscription will be cancelled immediately with no
                    proration and no refund. Paid event tickets are not refunded
                    automatically. They will not be able to sign in or apply again.
                  </p>
                </div>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium text-foreground">Reason category</span>
                  <select
                    value={category}
                    onChange={(event) =>
                      setCategory(event.target.value as RemovalReasonCategory | '')
                    }
                    className={inputClassName}
                    required
                  >
                    <option value="">Choose a reason</option>
                    {REMOVAL_REASON_CATEGORIES.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium text-foreground">
                    Internal note (optional)
                  </span>
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    className={textareaClassName}
                  />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium text-foreground">Type REMOVE to confirm</span>
                  <input
                    value={confirmationText}
                    onChange={(event) => setConfirmationText(event.target.value)}
                    className={inputClassName}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
              </>
            ) : (
              <>
                <div>
                  <h2 className="text-display text-lg font-semibold">Restore member</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {RESTORE_DOES_NOT_RESTORE_COPY}
                  </p>
                </div>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium text-foreground">Note</span>
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    className={textareaClassName}
                    required
                  />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium text-foreground">Type RESTORE to confirm</span>
                  <input
                    value={confirmationText}
                    onChange={(event) => setConfirmationText(event.target.value)}
                    className={inputClassName}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
              </>
            )}

            {errorMessage ? (
              <p role="alert" className="text-sm text-danger">
                {errorMessage}
              </p>
            ) : null}

            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={closeDialog}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={mode === 'remove' ? !canRemove : !canRestore}
                className={buttonPrimaryClassName}
              >
                {isPending
                  ? 'Saving...'
                  : mode === 'remove'
                    ? 'Remove member'
                    : 'Restore member'}
              </button>
            </div>
          </form>
        </dialog>
      ) : null}
    </section>
  )
}
