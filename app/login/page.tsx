'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  const handleSignUp = async () => {
    setMessage('')

    const { error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Check your email to confirm your signup.')
  }

  const handleSignIn = async () => {
    setMessage('')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Signed in successfully.')
  }

  return (
    <main style={{ maxWidth: '420px', margin: '80px auto', padding: '24px' }}>
      <h1 style={{ marginBottom: '16px' }}>Login or Sign Up</h1>

      <div style={{ display: 'grid', gap: '12px' }}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: '12px', border: '1px solid #ccc', borderRadius: '8px' }}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ padding: '12px', border: '1px solid #ccc', borderRadius: '8px' }}
        />

        <button
          onClick={handleSignUp}
          style={{ padding: '12px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}
        >
          Sign Up
        </button>

        <button
          onClick={handleSignIn}
          style={{ padding: '12px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}
        >
          Sign In
        </button>

        {message ? <p style={{ marginTop: '8px' }}>{message}</p> : null}
      </div>
    </main>
  )
}
