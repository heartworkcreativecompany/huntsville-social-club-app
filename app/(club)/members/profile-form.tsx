'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Card from '@/components/ui/card'
import {
  buttonPrimaryClassName,
  inputClassName,
} from '@/lib/event-labels'

type ProfileFormProps = {
  userId: string
  email: string
  fullName: string | null
  membershipIntent?: string | null
}

export default function ProfileForm({
  userId,
  email,
  fullName,
  membershipIntent,
}: ProfileFormProps) {
  const supabase = createClient()
  const router = useRouter()
  const [name, setName] = useState(fullName ?? '')
  const [intent, setIntent] = useState(membershipIntent ?? '')
  const [message, setMessage] = useState('')

  const handleSave = async () => {
    setMessage('Saving...')

    const basePayload = {
      id: userId,
      email,
      full_name: name,
      updated_at: new Date().toISOString(),
    }

    let error: { message: string } | null = null

    if (intent.trim()) {
      const withIntent = await supabase.from('profiles').upsert({
        ...basePayload,
        membership_intent: intent.trim(),
      } as never)

      error = withIntent.error

      if (error?.message.includes('membership_intent')) {
        const fallback = await supabase.from('profiles').upsert(basePayload)
        error = fallback.error
        if (!error) {
          setMessage(
            'Profile saved. Intent will appear once membership_intent is added to the database.'
          )
          router.refresh()
          return
        }
      }
    } else {
      const result = await supabase.from('profiles').upsert(basePayload)
      error = result.error
    }

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Profile saved successfully.')
    router.refresh()
  }

  return (
    <Card>
      <h2 className="text-display text-lg font-medium text-foreground">
        Edit profile
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        How you show up in discovery—name and a short statement of intent for the
        club community.
      </p>

      <div className="mt-4 grid max-w-lg gap-4">
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-foreground">Full name</span>
          <input
            type="text"
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClassName}
          />
        </label>

        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-foreground">
            Membership intent
          </span>
          <span className="text-xs text-muted-foreground">
            A brief note on why you are here—networking, community, professional
            connection, or hosting (visible when directory policies allow).
          </span>
          <textarea
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            placeholder="e.g. Building thoughtful local connections outside of work..."
            rows={4}
            className={`${inputClassName} resize-y`}
          />
        </label>

        <button
          type="button"
          onClick={handleSave}
          className={buttonPrimaryClassName}
        >
          Save profile
        </button>

        {message ? (
          <p className="text-sm text-muted-foreground">{message}</p>
        ) : null}
      </div>
    </Card>
  )
}
