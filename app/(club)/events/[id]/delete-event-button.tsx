'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { buttonSecondaryClassName } from '@/lib/event-labels'

type DeleteEventButtonProps = {
  eventId: string
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
      setMessage(error.message)
      return
    }

    router.push('/events')
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
