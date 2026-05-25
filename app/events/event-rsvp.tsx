'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

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
      <p style={{ marginTop: '12px', fontSize: '14px', color: '#555' }}>
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
    <div style={{ marginTop: '12px' }}>
      <p style={{ margin: '0 0 8px', fontSize: '14px' }}>
        {hasExistingRsvp ? 'Your RSVP:' : 'RSVP to this event:'}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {RSVP_OPTIONS.map((option) => {
          const isActive = currentStatus === option.value

          return (
            <button
              key={option.value}
              onClick={() => handleRsvp(option.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: isActive ? '2px solid #333' : '1px solid #ccc',
                cursor: 'pointer',
                fontWeight: isActive ? 600 : 400,
                background: isActive ? '#eee' : 'transparent',
              }}
            >
              {option.label}
            </button>
          )
        })}
      </div>
      {message ? <p style={{ margin: '8px 0 0', fontSize: '14px' }}>{message}</p> : null}
    </div>
  )
}
