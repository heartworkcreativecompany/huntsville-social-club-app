'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return ''

  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

type EventEditFormProps = {
  eventId: string
  initialTitle: string
  initialLocation: string | null
  initialStartsAt: string
  initialDescription: string | null
  initialEndsAt: string | null
  initialVisibility: string
}

export default function EventEditForm({
  eventId,
  initialTitle,
  initialLocation,
  initialStartsAt,
  initialDescription,
  initialEndsAt,
  initialVisibility,
}: EventEditFormProps) {
  const supabase = createClient()
  const router = useRouter()

  const [title, setTitle] = useState(initialTitle)
  const [location, setLocation] = useState(initialLocation ?? '')
  const [startsAt, setStartsAt] = useState(toDatetimeLocalValue(initialStartsAt))
  const [description, setDescription] = useState(initialDescription ?? '')
  const [endsAt, setEndsAt] = useState(toDatetimeLocalValue(initialEndsAt))
  const [visibility, setVisibility] = useState(initialVisibility)
  const [message, setMessage] = useState('')

  const handleSave = async () => {
    setMessage('Saving...')

    const { error } = await supabase
      .from('events')
      .update({
        title,
        location: location || null,
        starts_at: startsAt,
        description: description || null,
        ends_at: endsAt || null,
        visibility,
        updated_at: new Date().toISOString(),
      })
      .eq('id', eventId)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Event updated successfully.')
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

        <button
          onClick={handleSave}
          style={{ padding: '12px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}
        >
          Save Changes
        </button>

        {message ? <p>{message}</p> : null}
      </div>
    </section>
  )
}
