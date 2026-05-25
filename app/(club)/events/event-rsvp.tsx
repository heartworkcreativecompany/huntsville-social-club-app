'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { buttonSecondaryClassName } from '@/lib/event-labels'

type RsvpStatus = 'going' | 'maybe' | 'not_going'

type EventRsvpProps = {
  eventId: string
  userId: string
  eventStatus: string
  currentStatus?: string | null
}

const RSVP_OPTIONS: { value: RsvpStatus; label: string }[] = [
  { value: 'going', label: 'Going' },
  { value: 'maybe', label: 'Maybe' },
  { value: 'not_going', label: 'Not going' },
]

function isDuplicateKeyError(error: { code?: string; message: string }): boolean {
  const msg = error.message.toLowerCase()
  return (
    error.code === '23505' ||
    msg.includes('duplicate key') ||
    msg.includes('unique constraint') ||
    msg.includes('already exists')
  )
}

export default function EventRsvp({
  eventId,
  userId,
  eventStatus,
  currentStatus,
}: EventRsvpProps) {
  const supabase = createClient()
  const router = useRouter()
  const [message, setMessage] = useState('')

  const status = eventStatus ?? 'published'

  if (status !== 'published') {
    return (
      <p className="text-sm text-muted-foreground">
        RSVP is only available for published events.
      </p>
    )
  }

  const hasExistingRsvp = Boolean(currentStatus)

  const handleRsvp = async (rsvpStatus: RsvpStatus) => {
    setMessage('Saving...')

    const { data: existingRow } = await supabase
      .from('event_attendees')
      .select('user_id')
      .eq('event_id', eventId)
      .eq('user_id', userId)
      .maybeSingle()

    let error: { code?: string; message: string } | null = null

    if (existingRow) {
      const result = await supabase
        .from('event_attendees')
        .update({ status: rsvpStatus })
        .eq('event_id', eventId)
        .eq('user_id', userId)

      error = result.error
    } else {
      const result = await supabase.from('event_attendees').insert({
        event_id: eventId,
        user_id: userId,
        status: rsvpStatus,
      })

      error = result.error

      if (error && isDuplicateKeyError(error)) {
        const retry = await supabase
          .from('event_attendees')
          .update({ status: rsvpStatus })
          .eq('event_id', eventId)
          .eq('user_id', userId)

        error = retry.error
      }
    }

    if (error) {
      if (isDuplicateKeyError(error)) {
        setMessage('You already have an RSVP for this event. Please try again.')
      } else {
        setMessage(error.message)
      }
      return
    }

    setMessage('RSVP saved.')
    router.refresh()
  }

  return (
    <div>
      <p className="mb-3 text-sm text-muted-foreground">
        {hasExistingRsvp ? 'Your RSVP' : 'RSVP to this event'}
      </p>
      <div className="flex flex-wrap gap-2">
        {RSVP_OPTIONS.map((option) => {
          const isActive = currentStatus === option.value

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => handleRsvp(option.value)}
              className={`${buttonSecondaryClassName} ${
                isActive
                  ? 'border-accent bg-accent text-accent-foreground'
                  : ''
              }`}
            >
              {option.label}
            </button>
          )
        })}
      </div>
      {message ? (
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      ) : null}
    </div>
  )
}
