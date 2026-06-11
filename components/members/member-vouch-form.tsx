'use client'

import { useState, useTransition } from 'react'
import {
  createMemberVouch,
  withdrawMemberVouch,
} from '@/app/(club)/members/vouch-actions'
import {
  VOUCH_DISCLAIMER,
  VOUCH_NOTE_MAX,
  VOUCH_RELATIONSHIP_OPTIONS,
  VOUCH_TYPE_OPTIONS,
  vouchTypeLabel,
  type VouchType,
} from '@/lib/member-vouches'
import {
  buttonPrimaryClassName,
  buttonSecondaryClassName,
  inputClassName,
} from '@/lib/event-labels'

export default function MemberVouchForm({
  memberId,
  existingVouches,
}: {
  memberId: string
  existingVouches: { id: string; vouch_type: VouchType; status: string }[]
}) {
  const [vouchType, setVouchType] = useState<VouchType>('personal')
  const [relationshipContext, setRelationshipContext] = useState<string>(
    VOUCH_RELATIONSHIP_OPTIONS[0]
  )
  const [note, setNote] = useState('')
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()

  const activeTypes = new Set(
    existingVouches
      .filter((v) => v.status === 'active')
      .map((v) => v.vouch_type)
  )

  const handleSubmit = () => {
    setMessage('')
    startTransition(async () => {
      const result = await createMemberVouch({
        voucheeId: memberId,
        vouchType,
        relationshipContext,
        note,
      })
      if (result.error) {
        setMessage(result.error)
        return
      }
      setNote('')
      setMessage('Vouch submitted. Thank you for strengthening the community.')
    })
  }

  const handleWithdraw = (vouchId: string) => {
    setMessage('')
    startTransition(async () => {
      const result = await withdrawMemberVouch(vouchId)
      if (result.error) {
        setMessage(result.error)
        return
      }
      setMessage('Vouch withdrawn.')
    })
  }

  return (
    <div className="grid gap-4 rounded-lg border border-border bg-background/50 p-4 text-sm">
      <div>
        <p className="font-medium text-foreground">Vouch for this member</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Optional community signal — never required for approval.{' '}
          {VOUCH_DISCLAIMER}
        </p>
      </div>

      {existingVouches.filter((v) => v.status === 'active').length > 0 ? (
        <div className="grid gap-2">
          <p className="text-xs font-medium text-muted-foreground">
            Your active vouches
          </p>
          {existingVouches
            .filter((v) => v.status === 'active')
            .map((vouch) => (
              <div
                key={vouch.id}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <span className="text-foreground">
                  {vouchTypeLabel(vouch.vouch_type)}
                </span>
                <button
                  type="button"
                  className={buttonSecondaryClassName}
                  onClick={() => handleWithdraw(vouch.id)}
                  disabled={isPending}
                >
                  Withdraw
                </button>
              </div>
            ))}
        </div>
      ) : null}

      <label className="grid gap-1.5">
        <span className="font-medium text-foreground">Vouch type</span>
        <select
          className={inputClassName}
          value={vouchType}
          onChange={(e) => setVouchType(e.target.value as VouchType)}
        >
          {VOUCH_TYPE_OPTIONS.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={activeTypes.has(option.value)}
            >
              {option.label}
              {activeTypes.has(option.value) ? ' (already vouched)' : ''}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">
          {VOUCH_TYPE_OPTIONS.find((o) => o.value === vouchType)?.description}
        </span>
      </label>

      <label className="grid gap-1.5">
        <span className="font-medium text-foreground">
          How do you know them?
        </span>
        <select
          className={inputClassName}
          value={relationshipContext}
          onChange={(e) => setRelationshipContext(e.target.value)}
        >
          {VOUCH_RELATIONSHIP_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-1.5">
        <span className="font-medium text-foreground">
          Optional note for moderators
        </span>
        <textarea
          className={`${inputClassName} resize-y`}
          rows={2}
          maxLength={VOUCH_NOTE_MAX}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Not shown on public profiles."
        />
        <span className="text-xs text-muted-foreground">
          {note.length}/{VOUCH_NOTE_MAX}
        </span>
      </label>

      <button
        type="button"
        className={buttonPrimaryClassName}
        onClick={handleSubmit}
        disabled={isPending || activeTypes.has(vouchType)}
      >
        {isPending ? 'Submitting…' : 'Submit vouch'}
      </button>

      {message ? (
        <p className="text-xs text-muted-foreground">{message}</p>
      ) : null}
    </div>
  )
}
