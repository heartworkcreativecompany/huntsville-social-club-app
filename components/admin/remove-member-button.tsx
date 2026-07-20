'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { removeMember } from '@/app/(club)/admin/users/actions'
import {
  isRemoveMemberEmailConfirmation,
  removeMemberConfirmationLabel,
} from '@/lib/admin/remove-member-confirmation'
import { buttonPrimaryClassName, inputClassName } from '@/lib/event-labels'

type RemoveMemberButtonProps = {
  userId: string
  memberName: string
  memberEmail: string | null
  disabled?: boolean
  disabledReason?: string
}

export default function RemoveMemberButton({
  userId,
  memberName,
  memberEmail,
  disabled = false,
  disabledReason,
}: RemoveMemberButtonProps) {
  const router = useRouter()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const confirmInputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [confirmationText, setConfirmationText] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!open) {
      return
    }

    const dialog = dialogRef.current
    if (!dialog?.open) {
      dialog?.showModal()
    }

    const timer = window.setTimeout(() => {
      confirmInputRef.current?.focus()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [open])

  const closeDialog = () => {
    setOpen(false)
    setConfirmationText('')
    setErrorMessage('')
    dialogRef.current?.close()
  }

  const handleRemove = () => {
    setErrorMessage('')
    setSuccessMessage('')

    startTransition(async () => {
      const result = await removeMember({
        targetUserId: userId,
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

  const confirmationEmail = memberEmail?.trim() ?? ''
  const canConfirmRemoval = confirmationEmail.length > 0

  const canSubmit =
    canConfirmRemoval &&
    isRemoveMemberEmailConfirmation(confirmationText, memberEmail) &&
    !isPending

  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled || isPending || !canConfirmRemoval}
        className="inline-flex w-fit rounded-lg border border-danger/40 px-4 py-2 text-sm font-medium text-danger hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-60"
      >
        Remove member
      </button>

      {disabled && disabledReason ? (
        <p className="text-sm text-muted-foreground">{disabledReason}</p>
      ) : !canConfirmRemoval ? (
        <p className="text-sm text-muted-foreground">
          This member has no email on file, so removal cannot be confirmed.
        </p>
      ) : null}

      {successMessage ? (
        <p className="text-sm text-success">{successMessage}</p>
      ) : null}

      {open ? (
        <dialog
          ref={dialogRef}
          className="w-[min(100vw-2rem,28rem)] max-w-lg rounded-xl border border-border bg-surface p-0 text-foreground shadow-lg backdrop:bg-foreground/40"
          onClose={closeDialog}
        >
          <form
            method="dialog"
            className="grid gap-4 p-6"
            onSubmit={(event) => {
              event.preventDefault()
              if (canSubmit) {
                handleRemove()
              }
            }}
          >
            <div>
              <h2 className="text-display text-lg font-semibold text-danger">
                Remove member permanently
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                This permanently removes the member&apos;s account and profile,
                including messages, matches, notifications, and related records.
                This cannot be undone.
              </p>
            </div>

            <div className="rounded-lg border border-border bg-surface-elevated px-4 py-3 text-sm">
              <p className="font-medium text-foreground">{memberName}</p>
              <p className="mt-1 text-muted-foreground">
                {memberEmail ?? 'No email on file'}
              </p>
            </div>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-foreground">
                {removeMemberConfirmationLabel(memberEmail)}
              </span>
              <input
                ref={confirmInputRef}
                type="text"
                value={confirmationText}
                onChange={(event) => setConfirmationText(event.target.value)}
                className={inputClassName}
                autoComplete="off"
                spellCheck={false}
                inputMode="email"
                disabled={isPending || !canConfirmRemoval}
              />
            </label>

            {errorMessage ? (
              <p
                role="alert"
                className="rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-danger"
              >
                {errorMessage}
              </p>
            ) : null}

            <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-4">
              <button
                type="button"
                onClick={closeDialog}
                disabled={isPending}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className={`${buttonPrimaryClassName} !bg-danger !text-white hover:!bg-danger/90 disabled:opacity-60`}
              >
                {isPending ? 'Removing…' : 'Remove member'}
              </button>
            </div>
          </form>
        </dialog>
      ) : null}
    </div>
  )
}
