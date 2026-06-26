'use client'

import { useState, useTransition } from 'react'
import BrandIcon from '@/components/brand/brand-icon'
import Card from '@/components/ui/card'
import { buttonPrimaryClassName } from '@/lib/event-labels'
import { requestCuratedIntro } from '@/app/(club)/members/intro-actions'

export default function CuratedIntroCard() {
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'sent' | 'error'>('idle')
  const [isPending, startTransition] = useTransition()

  const handleRequest = () => {
    setStatus('idle')
    setMessage('')
    startTransition(async () => {
      const result = await requestCuratedIntro()
      if (result.error) {
        setMessage(result.error)
        setStatus('error')
        return
      }
      setMessage('Your curated intro request is in — our team will follow up soon.')
      setStatus('sent')
    })
  }

  return (
    <Card className="border-accent/30 bg-gradient-to-br from-accent-soft/80 to-surface">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-xl">
          <div className="flex items-center gap-3">
            <BrandIcon name="cocktail-gold" className="h-10 w-10" />
            <p className="eyebrow">Concierge</p>
          </div>
          <h2 className="text-display mt-3 text-2xl font-semibold">Curated Intro</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Tell us who you&apos;re hoping to meet. Our hosts hand-match members for
            mixers, speed dating, and one-on-one intros that feel natural — not
            awkward.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
          <button
            type="button"
            onClick={handleRequest}
            disabled={isPending || status === 'sent'}
            className={buttonPrimaryClassName}
          >
            {isPending ? 'Sending…' : status === 'sent' ? 'Request sent' : 'Request an intro'}
          </button>
          {message ? (
            <p
              className={`max-w-xs text-xs ${status === 'error' ? 'text-danger' : 'text-muted-foreground'}`}
              role={status === 'error' ? 'alert' : undefined}
            >
              {message}
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  )
}
