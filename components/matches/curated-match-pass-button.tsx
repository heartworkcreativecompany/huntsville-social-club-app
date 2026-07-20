'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { passCuratedRecommendation } from '@/app/(club)/matches/actions'
import { buttonSecondaryClassName } from '@/lib/event-labels'
import type { CuratedMatchDisplayState } from '@/lib/curated-match-lifecycle'

export default function CuratedMatchPassButton({
  recommendationId,
  displayState,
}: {
  recommendationId: string
  displayState: CuratedMatchDisplayState
}) {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const [passed, setPassed] = useState(false)
  const [isPending, startTransition] = useTransition()

  if (
    passed ||
    displayState === 'passed' ||
    displayState === 'declined' ||
    displayState === 'expired' ||
    displayState === 'connected' ||
    displayState === 'intro_requested'
  ) {
    return null
  }

  const handlePass = () => {
    setMessage('')
    const confirmed = window.confirm(
      'Pass on this recommendation? It will move out of your active inbox.'
    )
    if (!confirmed) return

    startTransition(async () => {
      const result = await passCuratedRecommendation(recommendationId)
      if (result.error) {
        setMessage(result.error)
        return
      }
      setPassed(true)
      setMessage('Recommendation passed.')
      router.refresh()
    })
  }

  return (
    <div>
      <button
        type="button"
        onClick={handlePass}
        disabled={isPending}
        className={buttonSecondaryClassName}
      >
        {isPending ? 'Saving…' : 'Not interested'}
      </button>
      {message ? (
        <p className="mt-2 text-xs text-muted-foreground">{message}</p>
      ) : null}
    </div>
  )
}
