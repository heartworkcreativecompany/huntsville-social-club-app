'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Card from '@/components/ui/card'
import { withdrawEmailMarketing } from '@/app/(club)/members/email-marketing-actions'
import { EMAIL_MARKETING_OPT_IN_LABEL } from '@/lib/email-consent'
import { buttonSecondaryClassName, mobileFullButtonClassName } from '@/lib/event-labels'

export default function EmailMarketingPreferenceCard({
  optedIn,
}: {
  optedIn: boolean
}) {
  const router = useRouter()
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [isPending, startTransition] = useTransition()
  const subscribed = optedIn && !done

  return (
    <Card>
      <h2 className="text-display text-lg font-semibold">Email preferences</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {subscribed
          ? EMAIL_MARKETING_OPT_IN_LABEL
          : 'You are not opted in to Huntsville Social Club news, event announcements, and offers.'}
      </p>
      {subscribed ? (
        <button
          type="button"
          className={`${buttonSecondaryClassName} ${mobileFullButtonClassName} mt-4`}
          disabled={isPending}
          onClick={() => {
            setError('')
            startTransition(async () => {
              const result = await withdrawEmailMarketing()
              if (result.error) {
                setError(result.error)
                return
              }
              setDone(true)
              router.refresh()
            })
          }}
        >
          {isPending ? 'Saving…' : 'Unsubscribe from news and offers'}
        </button>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  )
}
