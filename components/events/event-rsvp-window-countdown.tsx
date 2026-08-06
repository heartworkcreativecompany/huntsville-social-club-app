'use client'

import { useEffect, useState } from 'react'
import { formatCountdownRemaining } from '@/lib/event-rsvp-window'

export default function EventRsvpWindowCountdown({
  endsAtIso,
  label = 'Ends in',
}: {
  endsAtIso: string
  label?: string
}) {
  const [remaining, setRemaining] = useState(() =>
    formatCountdownRemaining(endsAtIso)
  )

  useEffect(() => {
    const tick = () => setRemaining(formatCountdownRemaining(endsAtIso))
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [endsAtIso])

  if (!remaining) return null

  return (
    <p className="mt-1 text-sm text-muted-foreground">
      {label}{' '}
      <span className="font-medium text-foreground tabular-nums">{remaining}</span>
    </p>
  )
}
