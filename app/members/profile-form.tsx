'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type ProfileFormProps = {
  userId: string
  email: string
  fullName: string | null
}

export default function ProfileForm({
  userId,
  email,
  fullName,
}: ProfileFormProps) {
  const supabase = createClient()
  const [name, setName] = useState(fullName ?? '')
  const [message, setMessage] = useState('')

  const handleSave = async () => {
    setMessage('Saving...')

    const { error } = await supabase.from('profiles').upsert({
      id: userId,
      email,
      full_name: name,
      updated_at: new Date().toISOString(),
    })

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Profile saved successfully.')
  }

  return (
    <section style={{ marginTop: '32px' }}>
      <h2 style={{ marginBottom: '12px' }}>Edit Profile</h2>

      <div style={{ display: 'grid', gap: '12px', maxWidth: '420px' }}>
        <input
          type="text"
          placeholder="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ padding: '12px', border: '1px solid #ccc', borderRadius: '8px' }}
        />

        <button
          onClick={handleSave}
          style={{ padding: '12px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}
        >
          Save Profile
        </button>

        {message ? <p>{message}</p> : null}
      </div>
    </section>
  )
}
