'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  buttonPrimaryClassName,
  buttonSecondaryClassName,
  inputClassName,
} from '@/lib/event-labels'

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return ''

  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function getEditErrorMessage(error: {
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
    return 'You do not have permission to edit this event.'
  }

  return error.message
}

type EventInlineEditProps = {
  eventId: string
  initialTitle: string
  initialLocation: string | null
  initialStartsAt: string
  initialDescription: string | null
  initialEndsAt: string | null
  initialVisibility: string
  initialStatus: string
}

export default function EventInlineEdit({
  eventId,
  initialTitle,
  initialLocation,
  initialStartsAt,
  initialDescription,
  initialEndsAt,
  initialVisibility,
  initialStatus,
}: EventInlineEditProps) {
  const supabase = createClient()
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [title, setTitle] = useState(initialTitle)
  const [location, setLocation] = useState(initialLocation ?? '')
  const [startsAt, setStartsAt] = useState(toDatetimeLocalValue(initialStartsAt))
  const [description, setDescription] = useState(initialDescription ?? '')
  const [endsAt, setEndsAt] = useState(toDatetimeLocalValue(initialEndsAt))
  const [visibility, setVisibility] = useState(initialVisibility)
  const [status, setStatus] = useState(initialStatus || 'published')
  const [message, setMessage] = useState('')

  const resetForm = () => {
    setTitle(initialTitle)
    setLocation(initialLocation ?? '')
    setStartsAt(toDatetimeLocalValue(initialStartsAt))
    setDescription(initialDescription ?? '')
    setEndsAt(toDatetimeLocalValue(initialEndsAt))
    setVisibility(initialVisibility)
    setStatus(initialStatus || 'published')
    setMessage('')
  }

  const handleCancel = () => {
    resetForm()
    setIsEditing(false)
  }

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
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', eventId)

    if (error) {
      setMessage(getEditErrorMessage(error))
      return
    }

    setMessage('Event updated successfully.')
    setIsEditing(false)
    router.refresh()
  }

  if (!isEditing) {
    return (
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        className={buttonSecondaryClassName}
      >
        Edit
      </button>
    )
  }

  return (
    <div className="mt-3 grid gap-3 rounded-lg border border-border bg-surface p-4">
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
        className={`${inputClassName} min-h-[100px] resize-y`}
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

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={handleSave} className={buttonPrimaryClassName}>
          Save changes
        </button>
        <button type="button" onClick={handleCancel} className={buttonSecondaryClassName}>
          Cancel
        </button>
      </div>

      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  )
}
