import { isEventAtCapacity } from '@/lib/event-attendance'
import { publicEventPriceLabel } from '@/lib/load-public-events'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const GUEST_CHECKOUT_MESSAGES = {
  full: 'This event just filled up.',
  already_registered:
    'This email already has a spot or a checkout in progress. Check your inbox for your Stripe receipt.',
  rate_limited: 'Too many attempts. Please try again in a little while.',
  not_available: "RSVPs for this event aren't open right now.",
  error: 'Something went wrong. Please try again.',
  success:
    "Thanks! Your payment is being confirmed. Stripe will email your receipt, and we'll see you there.",
  cancelled:
    "Checkout was cancelled, so your spot wasn't reserved. You can try again anytime.",
  invalidInput: 'Check your name, email, and answer, then try again.',
} as const

export type GuestCheckoutErrorCode =
  | 'full'
  | 'already_registered'
  | 'not_available'
  | 'rate_limited'
  | 'invalid_input'
  | 'error'

export type GuestRsvpFieldErrors = {
  fullName?: string
  email?: string
  rsvpAnswer?: string
  form?: string
}

export type GuestRsvpOffer =
  | { kind: 'hidden' }
  | { kind: 'sold_out' }
  | { kind: 'open'; priceLabel: string; spotsLeft: number | null }

export function guestCheckoutReturnMessage(
  guestCheckout: string | string[] | undefined
): string | null {
  const value = Array.isArray(guestCheckout) ? guestCheckout[0] : guestCheckout
  if (value === 'success') return GUEST_CHECKOUT_MESSAGES.success
  if (value === 'cancelled') return GUEST_CHECKOUT_MESSAGES.cancelled
  return null
}

export function spotsLeftLabel(spotsLeft: number | null): string | null {
  if (spotsLeft == null) return null
  return `Only ${spotsLeft} spots left.`
}

export function guestRsvpButtonLabel(priceLabel: string): string {
  return `RSVP as a guest for ${priceLabel}`
}

function eventHasNotStarted(startsAt: string, now: Date): boolean {
  const starts = new Date(startsAt).getTime()
  return !Number.isNaN(starts) && starts > now.getTime()
}

export function guestRsvpOffer(input: {
  feeCents: number | null
  startsAt: string
  generalRsvpOpen: boolean
  attendanceMax: number | null
  takenSeats: number | null
  now?: Date
}): GuestRsvpOffer {
  const now = input.now ?? new Date()
  if (input.feeCents == null || input.feeCents <= 0) return { kind: 'hidden' }
  if (!eventHasNotStarted(input.startsAt, now)) return { kind: 'hidden' }
  if (!input.generalRsvpOpen) return { kind: 'hidden' }

  const priceLabel = publicEventPriceLabel(input.feeCents)
  if (!priceLabel) return { kind: 'hidden' }

  const max = input.attendanceMax
  if (max != null && max > 0) {
    if (input.takenSeats == null) return { kind: 'hidden' }
    if (isEventAtCapacity(input.takenSeats, max)) return { kind: 'sold_out' }
    const remaining = max - input.takenSeats
    return {
      kind: 'open',
      priceLabel,
      spotsLeft: remaining <= 10 ? remaining : null,
    }
  }

  return { kind: 'open', priceLabel, spotsLeft: null }
}

export function guestRsvpNeedsSeatCount(input: {
  feeCents: number | null
  startsAt: string
  generalRsvpOpen: boolean
  attendanceMax: number | null
  now?: Date
}): boolean {
  const now = input.now ?? new Date()
  return (
    input.feeCents != null &&
    input.feeCents > 0 &&
    eventHasNotStarted(input.startsAt, now) &&
    input.generalRsvpOpen &&
    input.attendanceMax != null &&
    input.attendanceMax > 0
  )
}

export function guestRsvpFieldErrors(input: {
  fullName: string
  email: string
  rsvpAnswer: string
  rsvpQuestionRequired: boolean
}): GuestRsvpFieldErrors | null {
  const errors: GuestRsvpFieldErrors = {}
  const fullName = input.fullName.trim()
  const email = input.email.trim().toLowerCase()
  const answer = input.rsvpAnswer.trim()

  if (fullName.length < 1) errors.fullName = 'Enter your full name.'
  else if (fullName.length > 120) {
    errors.fullName = 'Name must be 120 characters or fewer.'
  }

  if (email.length < 1 || email.length > 320 || !EMAIL_PATTERN.test(email)) {
    errors.email = 'Enter a valid email.'
  }

  if (input.rsvpQuestionRequired && answer.length < 1) {
    errors.rsvpAnswer = 'Answer this question to continue.'
  } else if (answer.length > 300) {
    errors.rsvpAnswer = 'Answer must be 300 characters or fewer.'
  }

  return Object.keys(errors).length > 0 ? errors : null
}

export function guestCheckoutErrorMessage(
  code: GuestCheckoutErrorCode
): string {
  if (code === 'invalid_input') return GUEST_CHECKOUT_MESSAGES.invalidInput
  return GUEST_CHECKOUT_MESSAGES[code]
}

type GuestCheckoutCall = {
  eventId: string
  fullName: string
  email: string
  rsvpAnswer: string | null
  website: string
}

type GuestCheckoutResponse = { url: string } | { error: GuestCheckoutErrorCode }

export async function beginGuestCheckout(
  input: {
    eventId: string
    fullName: string
    email: string
    rsvpAnswer: string
    website: string
    rsvpQuestionRequired: boolean
  },
  checkout: (payload: GuestCheckoutCall) => Promise<GuestCheckoutResponse>
): Promise<
  | { type: 'redirect'; url: string }
  | { type: 'fields'; errors: GuestRsvpFieldErrors }
  | { type: 'message'; message: string }
> {
  const fieldErrors = guestRsvpFieldErrors(input)
  if (fieldErrors) return { type: 'fields', errors: fieldErrors }

  let result: GuestCheckoutResponse
  try {
    result = await checkout({
      eventId: input.eventId,
      fullName: input.fullName.trim(),
      email: input.email.trim().toLowerCase(),
      rsvpAnswer: input.rsvpAnswer.trim() || null,
      website: input.website,
    })
  } catch {
    return { type: 'message', message: GUEST_CHECKOUT_MESSAGES.error }
  }

  if ('url' in result && typeof result.url === 'string') {
    try {
      const destination = new URL(result.url)
      if (destination.protocol === 'https:') {
        return { type: 'redirect', url: result.url }
      }
    } catch {
      // Fall through to the generic error.
    }
    return { type: 'message', message: GUEST_CHECKOUT_MESSAGES.error }
  }

  if ('error' in result && result.error === 'invalid_input') {
    return {
      type: 'fields',
      errors: { form: GUEST_CHECKOUT_MESSAGES.invalidInput },
    }
  }

  if ('error' in result) {
    return { type: 'message', message: guestCheckoutErrorMessage(result.error) }
  }

  return { type: 'message', message: GUEST_CHECKOUT_MESSAGES.error }
}
