'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  isApprovedMember,
  resolveApplicationStatus,
} from '@/lib/application'
import {
  buttonPrimaryClassName,
  buttonSecondaryClassName,
  inputClassName,
} from '@/lib/event-labels'

export default function LoginPage() {
  const router = useRouter()
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

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      let profile: {
        application_status?: string | null
        role?: string | null
        full_name?: string | null
      } | null = null

      const extended = await supabase
        .from('profiles')
        .select('application_status, role, full_name')
        .eq('id', user.id)
        .maybeSingle()

      if (!extended.error) {
        profile = extended.data
      } else {
        const basic = await supabase
          .from('profiles')
          .select('role, full_name')
          .eq('id', user.id)
          .maybeSingle()
        profile = basic.data
      }

      const status = resolveApplicationStatus(profile)
      const role = profile?.role ?? 'member'

      router.push(isApprovedMember(status, role) ? '/home' : '/application')
    } else {
      router.push('/home')
    }

    router.refresh()
  }

  return (
    <div className="min-h-full bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
          <Link
            href="/"
            className="text-display text-xl font-medium text-foreground"
          >
            Huntsville Social Club
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-md px-5 py-16 sm:px-8">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Members
        </p>
        <h1 className="text-display mt-2 text-3xl font-medium text-foreground">
          Sign in
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Access your profile, club events, and verified member tools.
        </p>

        <div className="mt-8 grid gap-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClassName}
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClassName}
          />

          <button type="button" onClick={handleSignUp} className={buttonSecondaryClassName}>
            Sign up
          </button>

          <button type="button" onClick={handleSignIn} className={buttonPrimaryClassName}>
            Sign in
          </button>

          {message ? (
            <p className="text-sm text-muted-foreground">{message}</p>
          ) : null}
        </div>

        <p className="mt-8 text-sm text-muted-foreground">
          <Link href="/" className="font-medium text-accent underline">
            ← Back to public home
          </Link>
        </p>
      </main>
    </div>
  )
}
