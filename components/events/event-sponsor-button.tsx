'use client'

import { useState, useTransition } from 'react'
import { createEventSponsorshipCheckout } from '@/app/(club)/events/sponsorship-actions'
import { buttonSecondaryClassName, inputClassName } from '@/lib/event-labels'
import {
  EVENT_SPONSORSHIP_PRICE_LABEL,
  EVENT_SPONSORSHIP_TICKET_COUNT,
} from '@/lib/membership-tier-config'

export default function EventSponsorButton({
  eventId,
  sponsorshipAvailable,
}: {
  eventId: string
  sponsorshipAvailable: boolean
}) {
  const [businessName, setBusinessName] = useState('')
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  if (!sponsorshipAvailable) {
    return (
      <p className="text-sm text-muted-foreground">
        Sponsorship is not available for this event right now.
      </p>
    )
  }

  const startCheckout = () => {
    setError('')
    startTransition(async () => {
      const result = await createEventSponsorshipCheckout({
        eventId,
        businessName,
      })
      if (result.error || !result.url) {
        setError(result.error ?? 'Could not start checkout.')
        return
      }
      window.location.href = result.url
    })
  }

  return (
    <div className="grid gap-3">
      {!open ? (
        <button
          type="button"
          className={buttonSecondaryClassName}
          onClick={() => setOpen(true)}
        >
          Sponsor ({EVENT_SPONSORSHIP_PRICE_LABEL})
        </button>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Event sponsorship: {EVENT_SPONSORSHIP_PRICE_LABEL} per event.
            Includes {EVENT_SPONSORSHIP_TICKET_COUNT} tickets, logo placement,
            and a marketing table.
          </p>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Business name</span>
            <input
              className={inputClassName}
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Your business"
              disabled={isPending}
            />
          </label>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonSecondaryClassName}
              disabled={isPending}
              onClick={startCheckout}
            >
              {isPending ? 'Starting…' : `Pay ${EVENT_SPONSORSHIP_PRICE_LABEL} & sponsor`}
            </button>
            <button
              type="button"
              className="text-sm text-muted-foreground underline"
              disabled={isPending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  )
}
