'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Card from '@/components/ui/card'
import {
  buttonPrimaryClassName,
  inputClassName,
} from '@/lib/event-labels'
import { updateMemberProfile } from './actions'

type ProfileFormProps = {
  displayName: string
  bio: string
  locationArea: string
}

export default function ProfileForm({
  displayName,
  bio,
  locationArea,
}: ProfileFormProps) {
  const router = useRouter()
  const [name, setName] = useState(displayName)
  const [about, setAbout] = useState(bio)
  const [area, setArea] = useState(locationArea)
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()

  const handleSave = () => {
    setMessage('')
    startTransition(async () => {
      const result = await updateMemberProfile({
        displayName: name,
        bio: about,
        locationArea: area,
      })

      if (result.error) {
        setMessage(result.error)
        return
      }

      setMessage('Profile saved successfully.')
      router.refresh()
    })
  }

  return (
    <Card>
      <h2 className="text-display text-lg font-semibold">
        Edit profile
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Update how you appear in the member directory. Photo changes are managed
        through your application until post-launch profile photo editing ships.
      </p>

      <div className="mt-4 grid max-w-lg gap-4">
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-foreground">Display name</span>
          <input
            type="text"
            placeholder="How members see you"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClassName}
            disabled={isPending}
          />
        </label>

        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-foreground">Public area</span>
          <span className="text-xs text-muted-foreground">
            Neighborhood or general area — not your full address.
          </span>
          <input
            type="text"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            placeholder="e.g. Downtown Huntsville"
            className={inputClassName}
            disabled={isPending}
          />
        </label>

        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-foreground">About / bio</span>
          <span className="text-xs text-muted-foreground">
            A short note on what you are hoping to find in the club community.
          </span>
          <textarea
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            placeholder="e.g. Building thoughtful local connections outside of work..."
            rows={4}
            className={`${inputClassName} resize-y`}
            disabled={isPending}
          />
        </label>

        <button
          type="button"
          onClick={handleSave}
          className={buttonPrimaryClassName}
          disabled={isPending}
        >
          {isPending ? 'Saving…' : 'Save profile'}
        </button>

        {message ? (
          <p className="text-sm text-muted-foreground">{message}</p>
        ) : null}
      </div>
    </Card>
  )
}
