'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type EventFormProps = {
  userId: string
}

function getEventInsertErrorMessage(error: {
  message: string
  code?: string
}): string {
  const msg = error.message.toLowerCase()
  const isPermissionDenied =
    error.code === '42501' ||
    error.code === 'PGRST301' ||
    msg.includes('permission') ||
    msg.includes('policy') ||
    msg.includes('row-level security') ||
    msg.includes('row level security') ||
    msg.includes('not authorized') ||
    msg.includes('violates')

  if (isPermissionDenied) {
    return 'You do not have permission to create events.'
  }

  return error.message
}

export default function EventForm({ userId }: EventFormProps) {
  const supabase = createClient()
  const router = useRouter()

  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [description, setDescription] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [visibility, setVisibility] = useState('members')
  const [status, setStatus] = useState('published')
  const [message, setMessage] = useState('')

  const handleSave = async () => {
    setMessage('Saving...')

    const { data: newEvent, error: eventError } = await supabase
      .from('events')
      .insert({
        owner_id: userId,
        title,
        location,
        starts_at: startsAt,
        description: description || null,
        ends_at: endsAt || null,
        visibility,
        status,
      })
      .select('id')
      .single()

    if (eventError) {
      setMessage(getEventInsertErrorMessage(eventError))
      return
    }

    const { error: attendeeError } = await supabase.from('event_attendees').upsert({
      event_id: newEvent.id,
      user_id: userId,
      status: 'going',
    })

    if (attendeeError) {
      setMessage(
        `Event created, but could not add you as an attendee: ${attendeeError.message}`
      )
      router.refresh()
      return
    }

    setTitle('')
    setLocation('')
    setStartsAt('')
    setDescription('')
    setEndsAt('')
    setVisibility('members')
    setStatus('published')
    setMessage('Event created successfully.')
    router.refresh()
  }

  return (
    <section>
      <div style={{ display: 'grid', gap: '12px', maxWidth: '480px' }}>
        <input
          type="text"
          placeholder="Event title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ padding: '12px', border: '1px solid #ccc', borderRadius: '8px' }}
        />

        <input
          type="text"
          placeholder="Location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          style={{ padding: '12px', border: '1px solid #ccc', borderRadius: '8px' }}
        />

        <textarea
          placeholder="Event description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={{
            padding: '12px',
            border: '1px solid #ccc',
            borderRadius: '8px',
            minHeight: '120px',
          }}
        />

        <input
          type="datetime-local"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
          style={{ padding: '12px', border: '1px solid #ccc', borderRadius: '8px' }}
        />

        <input
          type="datetime-local"
          value={endsAt}
          onChange={(e) => setEndsAt(e.target.value)}
          style={{ padding: '12px', border: '1px solid #ccc', borderRadius: '8px' }}
        />

        <select
          value={visibility}
          onChange={(e) => setVisibility(e.target.value)}
          style={{ padding: '12px', border: '1px solid #ccc', borderRadius: '8px' }}
        >
          <option value="private">private</option>
          <option value="members">members</option>
          <option value="public">public</option>
        </select>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={{ padding: '12px', border: '1px solid #ccc', borderRadius: '8px' }}
        >
          <option value="draft">draft</option>
          <option value="published">published</option>
          <option value="cancelled">cancelled</option>
        </select>

        <button
          onClick={handleSave}
          style={{ padding: '12px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}
        >
          Save Event
        </button>

        {message ? <p>{message}</p> : null}
      </div>
    </section>
  )
}
