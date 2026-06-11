'use client'

import * as Sentry from '@sentry/nextjs'
import Link from 'next/link'
import { useEffect } from 'react'
import { buttonPrimaryClassName } from '@/lib/event-labels'

export default function Error({
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
    <div className="flex min-h-full flex-col items-center justify-center bg-background px-5 py-16 text-center">
      <h1 className="text-display text-2xl font-medium text-foreground">
        Something went wrong
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
        We hit an unexpected error. Try again, or return home. If this keeps
        happening, contact support.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className={buttonPrimaryClassName}>
          Try again
        </button>
        <Link href="/" className={buttonPrimaryClassName}>
          Go home
        </Link>
      </div>
    </div>
  )
}
