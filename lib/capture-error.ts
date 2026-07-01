/** Report operational errors without PII. */

export function captureOperationalError(
  context: string,
  error: unknown,
  extra?: Record<string, string | number | boolean>
) {
  if (process.env.NODE_ENV === 'development') {
    console.error(`[${context}]`, error, extra ?? {})
  }
}
