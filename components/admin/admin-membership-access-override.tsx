'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  grantMembershipAccessOverrideAction,
  revokeMembershipAccessOverrideAction,
} from '@/app/(club)/admin/users/[id]/actions'
import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import {
  grantMembershipAccessOverrideConfirmationCopy,
  membershipAccessOverrideTierLabel,
  revokeMembershipAccessOverrideConfirmationCopy,
  type MembershipAccessOverride,
  type MembershipAccessOverrideTier,
} from '@/lib/membership-access-override'
import {
  buttonPrimaryClassName,
  buttonSecondaryClassName,
  inputClassName,
} from '@/lib/event-labels'

type ConfirmState = 'grant' | 'revoke' | null

export default function AdminMembershipAccessOverride({
  memberId,
  memberName,
  override,
}: {
  memberId: string
  memberName: string
  override: MembershipAccessOverride | null
}) {
  const router = useRouter()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [tier, setTier] = useState<MembershipAccessOverrideTier>(
    override?.tier ?? 'inner_circle'
  )
  const [expiresAt, setExpiresAt] = useState(
    override?.expiresAt ? override.expiresAt.slice(0, 10) : ''
  )
  const [reason, setReason] = useState(override?.reason ?? '')
  const [confirm, setConfirm] = useState<ConfirmState>(null)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isPending, startTransition] = useTransition()

  const tierLabel = membershipAccessOverrideTierLabel(tier)
  const confirmationCopy = useMemo(() => {
    if (confirm === 'revoke' && override) {
      return revokeMembershipAccessOverrideConfirmationCopy(
        membershipAccessOverrideTierLabel(override.tier),
        memberName
      )
    }
    if (confirm === 'grant') {
      return grantMembershipAccessOverrideConfirmationCopy(tierLabel, memberName)
    }
    return ''
  }, [confirm, memberName, override, tierLabel])

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

  const submit = () => {
    if (!confirm) return
    setErrorMessage('')
    startTransition(async () => {
      if (confirm === 'grant') {
        const result = await grantMembershipAccessOverrideAction({
          memberId,
          tier,
          expiresAt: expiresAt || null,
          reason,
        })
        if ('error' in result && result.error) {
          setErrorMessage(result.error)
          return
        }
        closeConfirm()
        setMessage(
          result.alreadyActive
            ? 'Complimentary access override is already in place.'
            : 'Complimentary access override saved.'
        )
        router.refresh()
        return
      }

      const result = await revokeMembershipAccessOverrideAction({ memberId })
      if ('error' in result && result.error) {
        setErrorMessage(result.error)
        return
      }
      closeConfirm()
      setMessage('Complimentary access override revoked.')
      router.refresh()
    })
  }

  return (
    <Card>
      <h3 className="text-display text-base font-semibold">
        Complimentary access override
      </h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Grants Inner Circle or Elite Circle entitlements without changing the
        Stripe subscription or billing record.
      </p>

      {override ? (
        <div className="mt-4 rounded-xl border border-border bg-surface-elevated p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="premium_outline">
              Complimentary access override —{' '}
              {membershipAccessOverrideTierLabel(override.tier)}
            </Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Started {new Date(override.startsAt).toLocaleString()}
            {override.expiresAt
              ? ` · Expires ${new Date(override.expiresAt).toLocaleString()}`
              : ' · No expiration'}
          </p>
          {override.reason ? (
            <p className="mt-2 text-sm text-foreground">
              <span className="font-medium">Private reason: </span>
              {override.reason}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          No complimentary access override. Entitlements follow Stripe or coupon
          state.
        </p>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-foreground">Override tier</span>
          <select
            className={inputClassName}
            value={tier}
            disabled={isPending}
            onChange={(event) =>
              setTier(event.target.value as MembershipAccessOverrideTier)
            }
          >
            <option value="inner_circle">Inner Circle</option>
            <option value="elite_circle">Elite Circle</option>
          </select>
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-foreground">
            Expires (optional)
          </span>
          <input
            type="date"
            className={inputClassName}
            value={expiresAt}
            disabled={isPending}
            onChange={(event) => setExpiresAt(event.target.value)}
          />
        </label>
      </div>

      <label className="mt-4 grid gap-1.5 text-sm">
        <span className="font-medium text-foreground">
          Private reason (optional)
        </span>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className={`${inputClassName} min-h-24 rounded-xl`}
          placeholder="Visible to administrators only."
          disabled={isPending}
        />
      </label>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          className={buttonPrimaryClassName}
          disabled={isPending}
          onClick={() => openConfirm('grant')}
        >
          {override ? 'Update complimentary access' : 'Grant complimentary access'}
        </button>
        {override ? (
          <button
            type="button"
            className={buttonSecondaryClassName}
            disabled={isPending}
            onClick={() => openConfirm('revoke')}
          >
            Revoke override
          </button>
        ) : null}
      </div>

      {message ? <p className="mt-3 text-sm text-success">{message}</p> : null}
      {errorMessage && !confirm ? (
        <p role="alert" className="mt-3 text-sm text-danger">
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
            {confirm === 'revoke'
              ? 'Revoke complimentary access'
              : 'Grant complimentary access'}
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
                : confirm === 'revoke'
                  ? 'Revoke override'
                  : 'Confirm'}
            </button>
          </div>
        </form>
      </dialog>
    </Card>
  )
}
