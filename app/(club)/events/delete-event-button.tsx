'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { buttonSecondaryClassName } from '@/lib/event-labels'

type DeleteEventButtonProps = {
  eventId: string
}

function getDeleteErrorMessage(error: {
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
    return 'You do not have permission to delete this event.'
  }

  return error.message
}

export default function DeleteEventButton({ eventId }: DeleteEventButtonProps) {
  const supabase = createClient()
  const router = useRouter()
  const [message, setMessage] = useState('')

  const handleDelete = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to delete this event?'
    )

    if (!confirmed) {
      return
    }

    setMessage('Deleting...')

    const { error } = await supabase.from('events').delete().eq('id', eventId)

    if (error) {
      setMessage(getDeleteErrorMessage(error))
      return
    }

    setMessage('Event deleted.')
    router.refresh()
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleDelete}
        className={`${buttonSecondaryClassName} border-danger/30 text-danger hover:bg-danger-soft`}
      >
        Delete event
      </button>
      {message ? (
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      ) : null}
    </div>
  )
}
