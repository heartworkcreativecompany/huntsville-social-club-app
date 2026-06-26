'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Card from '@/components/ui/card'
import {
  buttonPrimaryClassName,
  inputClassName,
} from '@/lib/event-labels'

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
  const [eventType, setEventType] = useState('standard_event')
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
        event_type: eventType,
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
    <Card>
      <div className="grid gap-4">
        <input
          type="text"
          placeholder="Event title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputClassName}
        />

        <input
          type="text"
          placeholder="Location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className={inputClassName}
        />

        <textarea
          placeholder="Event description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={`${inputClassName} min-h-[120px] resize-y`}
        />

        <input
          type="datetime-local"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
          className={inputClassName}
        />

        <input
          type="datetime-local"
          value={endsAt}
          onChange={(e) => setEndsAt(e.target.value)}
          className={inputClassName}
        />

        <select
          value={eventType}
          onChange={(e) => setEventType(e.target.value)}
          className={inputClassName}
        >
          <option value="standard_event">Standard event</option>
          <option value="circle_social">Circle Social (paid members)</option>
        </select>

        <select
          value={visibility}
          onChange={(e) => setVisibility(e.target.value)}
          className={inputClassName}
        >
          <option value="private">Private</option>
          <option value="members">Members</option>
          <option value="public">Public</option>
        </select>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={inputClassName}
        >
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <button type="button" onClick={handleSave} className={buttonPrimaryClassName}>
          Save event
        </button>

        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </div>
    </Card>
  )
}
