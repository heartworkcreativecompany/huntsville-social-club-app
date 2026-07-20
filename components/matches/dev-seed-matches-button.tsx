'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { seedDevMatchRecommendations } from '@/app/(club)/matches/actions'
import { buttonSecondaryClassName } from '@/lib/event-labels'

export default function DevSeedMatchesButton() {
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()

  const handleSeed = () => {
    setMessage('')
    startTransition(async () => {
      const result = await seedDevMatchRecommendations()
      if ('error' in result && result.error) {
        setMessage(result.error)
        return
      }
      setMessage(result.message ?? 'Sample recommendations added.')
    })
  }

  return (
    <div className="mt-4 rounded-lg border border-dashed border-warning/40 bg-warning-soft/20 px-4 py-3 text-left">
      <p className="text-sm font-medium text-foreground">Development only</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Seed up to three sample recommendations from other approved members with
        Dating selected. Requires{' '}
        <code className="text-foreground">SUPABASE_SERVICE_ROLE_KEY</code>.
      </p>
      <button
        type="button"
        onClick={handleSeed}
        disabled={isPending}
        className={`${buttonSecondaryClassName} mt-3`}
      >
        {isPending ? 'Seeding…' : 'Seed sample matches'}
      </button>
      {message ? (
        <p className="mt-2 text-xs text-muted-foreground">{message}</p>
      ) : null}
      <p className="mt-2 text-xs text-muted">
        Or run{' '}
        <Link href="/compatibility" className="underline">
          the questionnaire
        </Link>{' '}
        first if your inbox is gated.
      </p>
    </div>
  )
}
