'use client'

import * as Sentry from '@sentry/nextjs'
import Link from 'next/link'
import { useEffect } from 'react'
import { buttonPrimaryClassName } from '@/lib/event-labels'

export default function ClubError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="py-12 text-center">
      <h1 className="text-display text-2xl font-medium text-foreground">
        Could not load this page
      </h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
        An unexpected error occurred. Your session is still active—try again or
        head back to member home.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className={buttonPrimaryClassName}>
          Try again
        </button>
        <Link href="/home" className={buttonPrimaryClassName}>
          Member home
        </Link>
      </div>
    </div>
  )
}
