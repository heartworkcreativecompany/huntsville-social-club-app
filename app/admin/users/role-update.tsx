'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

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
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
      <select
        value={role}
        onChange={(e) => setRole(e.target.value)}
        style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '8px' }}
      >
        <option value="member">member</option>
        <option value="host">host</option>
        <option value="admin">admin</option>
      </select>
      <button
        onClick={handleSave}
        style={{ padding: '8px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}
      >
        Save
      </button>
      {message ? <span style={{ fontSize: '14px' }}>{message}</span> : null}
    </div>
  )
}
