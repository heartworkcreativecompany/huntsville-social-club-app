'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

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
    <div style={{ marginTop: '16px' }}>
      <button
        onClick={handleDelete}
        style={{
          padding: '12px',
          borderRadius: '8px',
          border: 'none',
          cursor: 'pointer',
          background: '#f5d5d5',
        }}
      >
        Delete Event
      </button>
      {message ? <p style={{ margin: '8px 0 0', fontSize: '14px' }}>{message}</p> : null}
    </div>
  )
}
