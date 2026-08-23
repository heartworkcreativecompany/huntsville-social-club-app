'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  awardMemberRecognitionBadgesAction,
  revokeMemberRecognitionBadgeAction,
} from '@/app/(club)/admin/users/[id]/actions'
import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import {
  awardRecognitionBadgeConfirmationCopy,
  revokeRecognitionBadgeConfirmationCopy,
} from '@/lib/recognition-badges/catalog'
import type { AdminMemberBadgeState } from '@/lib/recognition-badges/admin'
import {
  buttonPrimaryClassName,
  buttonSecondaryClassName,
  inputClassName,
} from '@/lib/event-labels'

type ConfirmState =
  | { type: 'award'; slugs: string[]; labels: string[] }
  | { type: 'revoke'; slug: string; label: string }
  | null

export default function AdminMemberBadgesManager({
  state,
  embedded = false,
}: {
  state: AdminMemberBadgeState
  embedded?: boolean
}) {
  const router = useRouter()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([])
  const [adminNote, setAdminNote] = useState('')
  const [confirm, setConfirm] = useState<ConfirmState>(null)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isPending, startTransition] = useTransition()

  const activeSlugs = new Set(state.activeAwards.map((award) => award.slug))
  const availableCatalog = state.catalog.filter(
    (entry) => entry.active && !activeSlugs.has(entry.slug)
  )

  const confirmationCopy = useMemo(() => {
    if (!confirm) return ''
    if (confirm.type === 'award') {
      return awardRecognitionBadgeConfirmationCopy(
        confirm.labels,
        state.member.fullName
      )
    }
    return revokeRecognitionBadgeConfirmationCopy(
      confirm.label,
      state.member.fullName
    )
  }, [confirm, state.member.fullName])

  const openConfirm = (next: ConfirmState) => {
    setErrorMessage('')
    setMessage('')
    setConfirm(next)
    dialogRef.current?.showModal()
  }

  const closeConfirm = () => {
    setConfirm(null)
    dialogRef.current?.close()
  }

  const toggleSlug = (slug: string) => {
    setSelectedSlugs((current) =>
      current.includes(slug)
        ? current.filter((value) => value !== slug)
        : [...current, slug]
    )
  }

  const submit = () => {
    if (!confirm) return
    setErrorMessage('')
    startTransition(async () => {
      if (confirm.type === 'award') {
        const result = await awardMemberRecognitionBadgesAction({
          memberId: state.member.id,
          slugs: confirm.slugs,
          adminNote,
        })
        if ('error' in result && result.error) {
          setErrorMessage(result.error)
          return
        }
        setSelectedSlugs([])
        setAdminNote('')
        closeConfirm()
        setMessage('Recognition badge updated.')
        router.refresh()
        return
      }

      const result = await revokeMemberRecognitionBadgeAction({
        memberId: state.member.id,
        slug: confirm.slug,
      })
      if ('error' in result && result.error) {
        setErrorMessage(result.error)
        return
      }
      closeConfirm()
      setMessage('Recognition badge updated.')
      router.refresh()
    })
  }

  return (
    <div className="grid gap-6">
      {embedded ? null : (
      <Card>
        <h2 className="text-display text-lg font-semibold">
          {state.member.fullName}
        </h2>
        {state.member.email ? (
          <p className="mt-1 text-sm text-muted-foreground">{state.member.email}</p>
        ) : null}
        <p className="mt-3 text-sm text-muted-foreground">
          Recognition badges are public labels only. They are not membership
          tiers, Stripe subscriptions, coupons, or access entitlements.
        </p>
      </Card>
      )}

      <Card>
        <h3 className="text-display text-base font-semibold">Active badges</h3>
        {state.activeAwards.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No active recognition badges.
          </p>
        ) : (
          <ul className="mt-4 grid gap-4">
            {state.activeAwards.map((award) => (
              <li
                key={award.slug}
                className="rounded-xl border border-border bg-surface-elevated p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Badge variant="premium_outline">{award.publicLabel}</Badge>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {award.publicDescription}
                    </p>
                    {award.adminNote ? (
                      <p className="mt-2 text-sm text-foreground">
                        <span className="font-medium">Private admin note: </span>
                        {award.adminNote}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className={buttonSecondaryClassName}
                    disabled={isPending}
                    onClick={() =>
                      openConfirm({
                        type: 'revoke',
                        slug: award.slug,
                        label: award.publicLabel,
                      })
                    }
                  >
                    Revoke
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h3 className="text-display text-base font-semibold">Award catalog badges</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Choose one or more catalog badges. Custom badge text is not available
          in this version.
        </p>
        {availableCatalog.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            All active catalog badges are already awarded.
          </p>
        ) : (
          <fieldset className="mt-4 grid gap-3">
            <legend className="sr-only">Available catalog badges</legend>
            {availableCatalog.map((entry) => (
              <label
                key={entry.slug}
                className="flex items-start gap-3 text-sm text-foreground"
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selectedSlugs.includes(entry.slug)}
                  onChange={() => toggleSlug(entry.slug)}
                  disabled={isPending}
                />
                <span>
                  <span className="font-medium">{entry.publicLabel}</span>
                  <span className="mt-1 block text-muted-foreground">
                    {entry.publicDescription}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        )}

        <label className="mt-5 grid gap-1.5 text-sm">
          <span className="font-medium text-foreground">
            Private admin note (optional)
          </span>
          <textarea
            value={adminNote}
            onChange={(event) => setAdminNote(event.target.value)}
            className={`${inputClassName} min-h-24 rounded-xl`}
            placeholder="Visible to administrators only. Never shown on public profiles."
            disabled={isPending || availableCatalog.length === 0}
          />
        </label>

        <button
          type="button"
          className={`${buttonPrimaryClassName} mt-4`}
          disabled={isPending || selectedSlugs.length === 0}
          onClick={() => {
            const labels = availableCatalog
              .filter((entry) => selectedSlugs.includes(entry.slug))
              .map((entry) => entry.publicLabel)
            openConfirm({ type: 'award', slugs: selectedSlugs, labels })
          }}
        >
          Award selected badges
        </button>
      </Card>

      {message ? <p className="text-sm text-success">{message}</p> : null}
      {errorMessage && !confirm ? (
        <p role="alert" className="text-sm text-danger">
          {errorMessage}
        </p>
      ) : null}

      <dialog
        ref={dialogRef}
        className="w-[min(100vw-2rem,28rem)] max-w-lg rounded-xl border border-border bg-surface p-0 text-foreground shadow-lg backdrop:bg-foreground/40"
        onClose={() => setConfirm(null)}
      >
        <form
          method="dialog"
          className="grid gap-4 p-6"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <h2 className="text-display text-lg font-semibold">
            {confirm?.type === 'revoke' ? 'Revoke badge' : 'Award badge'}
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {confirmationCopy}
          </p>
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
              onClick={closeConfirm}
              disabled={isPending}
              className={buttonSecondaryClassName}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className={buttonPrimaryClassName}
            >
              {isPending
                ? 'Saving…'
                : confirm?.type === 'revoke'
                  ? 'Revoke badge'
                  : 'Award badge'}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  )
}
