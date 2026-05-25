'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  buttonPrimaryClassName,
  inputClassName,
} from '@/lib/event-labels'

type RoleUpdateProps = {
  userId: string
  currentRole: string
}

export default function RoleUpdate({ userId, currentRole }: RoleUpdateProps) {
  const supabase = createClient()
  const router = useRouter()
  const [role, setRole] = useState(currentRole || 'member')
  const [message, setMessage] = useState('')

  const handleSave = async () => {
    setMessage('Saving...')

    const { error } = await supabase
      .from('profiles')
      .update({
        role,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Role updated.')
    router.refresh()
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={role}
        onChange={(e) => setRole(e.target.value)}
        className={inputClassName}
      >
        <option value="member">Member</option>
        <option value="host">Host</option>
        <option value="admin">Admin</option>
      </select>
      <button type="button" onClick={handleSave} className={buttonPrimaryClassName}>
        Save role
      </button>
      {message ? (
        <span className="text-sm text-muted-foreground">{message}</span>
      ) : null}
    </div>
  )
}
