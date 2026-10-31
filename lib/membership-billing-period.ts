/**
 * Cancellation scheduled for the end of an already-paid period.
 * Access lasts through billing_period_end. An immediately cancelled
 * subscription is represented by subscription_status, not this flag.
 */
export function scheduledCancellationHasEnded(
  billing: {
    cancel_at_period_end?: boolean | null
    billing_period_end?: string | null
  },
  now: Date = new Date()
): boolean {
  if (billing.cancel_at_period_end !== true) return false
  if (!billing.billing_period_end) return false
  const end = Date.parse(billing.billing_period_end)
  return !Number.isNaN(end) && end <= now.getTime()
}
