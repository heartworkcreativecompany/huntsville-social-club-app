'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  addPremiumEventGuestInvite,
  removePremiumEventGuestInvite,
} from '@/app/(club)/events/guest-invite-actions'
import {
  buttonPrimaryClassName,
  buttonSecondaryClassName,
  inputClassName,
} from '@/lib/event-labels'

export default function EventGuestInviteControls({
  eventId,
  eventType,
  isGoing,
  guestName,
  guestInviteConsumed,
  guestInvitesRemaining,
  isElite,
}: {
  eventId: string
  eventType: string | null
  isGoing: boolean
  guestName: string | null
  guestInviteConsumed: boolean
  guestInvitesRemaining: number
  isElite: boolean
}) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  if (eventType !== 'premium_event' || !isElite) {
    return null
  }

  if (guestInviteConsumed && guestName) {
    return (
      <div className="mt-4 rounded-lg border border-border bg-surface-elevated px-3 py-3 text-sm">
        <p className="font-medium text-foreground">Guest invite used</p>
        <p className="mt-1 text-muted-foreground">
          Guest: <span className="text-foreground">{guestName}</span>
        </p>
        <button
          type="button"
          className={`${buttonSecondaryClassName} mt-3`}
          disabled={isPending}
          onClick={() => {
            setError('')
            setMessage('')
            startTransition(async () => {
              const result = await removePremiumEventGuestInvite({ eventId })
              if (result.error) {
                setError(result.error)
                return
              }
              setMessage('Guest invite returned to your billing period.')
              router.refresh()
            })
          }}
        >
          {isPending ? 'Removing…' : 'Remove guest'}
        </button>
        {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
        {message ? (
          <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        ) : null}
      </div>
    )
  }

  if (!isGoing) {
    if (guestInvitesRemaining <= 0) {
      return null
    }

    return (
      <p className="mt-4 text-sm text-muted-foreground">
        RSVP as Going to use your Elite guest invite on this premium event (
        {guestInvitesRemaining} remaining this period).
      </p>
    )
  }

  if (guestInvitesRemaining <= 0) {
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        You have used your guest invite for this billing period.
      </p>
    )
  }

  return (
    <div className="mt-4 rounded-lg border border-accent/30 bg-accent-soft/30 px-3 py-3">
      <p className="text-sm font-medium text-foreground">
        Add a guest ({guestInvitesRemaining} invite remaining)
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Elite Circle includes 1 guest invite per billing period for premium
        events.
      </p>
      <label className="mt-3 grid gap-1 text-sm">
        <span className="text-muted-foreground">Guest full name</span>
        <input
          className={inputClassName}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Guest name"
          disabled={isPending}
        />
      </label>
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      {message ? (
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      ) : null}
      <button
        type="button"
        className={`${buttonPrimaryClassName} mt-3`}
        disabled={isPending}
        onClick={() => {
          setError('')
          setMessage('')
          startTransition(async () => {
            const result = await addPremiumEventGuestInvite({
              eventId,
              guestName: name,
            })
            if (result.error) {
              setError(result.error)
              return
            }
            setName('')
            setMessage('Guest added.')
            router.refresh()
          })
        }}
      >
        {isPending ? 'Adding…' : 'Use guest invite'}
      </button>
    </div>
  )
}
