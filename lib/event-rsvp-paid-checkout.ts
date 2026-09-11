import type { PersistPaidCheckoutPendingAnswerResult } from '@/lib/event-rsvp-pending-answer'

export type PaidCheckoutSessionResult =
  | { url: string; sessionId: string }
  | { error: string }

/**
 * Paid Going may start Stripe Checkout only after a required/nonblank
 * RSVP answer is durably staged. Empty/no-question plans skip persistence.
 */
export async function startPaidGoingAfterPersistingAnswer(input: {
  persistPending: () => Promise<PersistPaidCheckoutPendingAnswerResult>
  createCheckout: () => Promise<PaidCheckoutSessionResult>
}): Promise<PaidCheckoutSessionResult> {
  const persisted = await input.persistPending()
  if ('error' in persisted) {
    return { error: persisted.error }
  }
  return input.createCheckout()
}

export function paidCheckoutAttendeeWrite(input: {
  hasUnpaidGoingPlaceholder: boolean
  hasExistingAttendeeRow: boolean
}): 'clear_unpaid_going_placeholder' | null {
  if (input.hasUnpaidGoingPlaceholder && input.hasExistingAttendeeRow) {
    return 'clear_unpaid_going_placeholder'
  }
  return null
}
