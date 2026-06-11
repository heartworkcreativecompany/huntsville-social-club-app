/** Report operational errors without PII. Sentry is optional until DSN is set. */

export function captureOperationalError(
  context: string,
  error: unknown,
  extra?: Record<string, string | number | boolean>
) {
  if (process.env.NODE_ENV === 'development') {
    console.error(`[${context}]`, error, extra ?? {})
  }

  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return

  void import('@sentry/nextjs').then((Sentry) => {
    Sentry.captureException(error, {
      tags: { context },
      extra,
    })
  })
}
