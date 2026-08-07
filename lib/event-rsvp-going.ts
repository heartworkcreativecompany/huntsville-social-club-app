import type {
  EventAccessType,
  EventRegistrationDecision,
  ProductTier,
} from '@/lib/membership-tier-config'

/**
 * Going is blocked only when the member cannot register Going and is not
 * already Going. Eligible members (RSVP open + allowed) always get an
 * enabled primary Going button.
 */
export function resolveGoingButtonState(input: {
  canRegisterGoing: boolean
  currentStatus?: string | null
  isPending?: boolean
}): { goingBlocked: boolean; disabled: boolean } {
  const alreadyGoing = input.currentStatus === 'going'
  const goingBlocked = !input.canRegisterGoing && !alreadyGoing
  const disabled = Boolean(input.isPending) || goingBlocked
  return { goingBlocked, disabled }
}

export function isGoingRegistrationEligible(
  registrationPreview: EventRegistrationDecision | null | undefined,
  atCapacity: boolean
): boolean {
  if (atCapacity) return false
  if (!registrationPreview) return true
  return registrationPreview.allowed !== false
}

/**
 * Unpaid paid_per_event placeholders must not count as confirmed Going
 * (legacy rows could be status=going + payment_status=pending).
 */
export function isConfirmedGoingAttendee(
  row:
    | {
        status?: string | null
        payment_status?: string | null
      }
    | null
    | undefined
): boolean {
  if (!row || row.status !== 'going') return false
  if (row.payment_status === 'pending') return false
  return true
}

export function effectiveAttendeeStatus(
  row:
    | {
        status?: string | null
        payment_status?: string | null
      }
    | null
    | undefined
): string | null {
  if (!row?.status) return null
  if (row.status === 'going' && row.payment_status === 'pending') {
    return null
  }
  return row.status
}

/**
 * Free members (and anyone on paid_per_event) must pay via Stripe Checkout
 * when the event has a fee — never get an immediate complimentary Going.
 */
export function shouldUseEventFeeCheckout(input: {
  eventType: EventAccessType | string | null | undefined
  feeCents: number | null | undefined
  productTier: ProductTier
  decision: EventRegistrationDecision
}): boolean {
  if (!input.decision.allowed) return false
  const feeCents = input.feeCents ?? 0
  if (!Number.isFinite(feeCents) || feeCents <= 0) return false

  if (input.decision.method === 'paid_per_event') {
    return true
  }

  // Belt-and-suspenders: free members never RSVP Going free on premium events.
  if (
    input.eventType === 'premium_event' &&
    input.productTier === 'member'
  ) {
    return true
  }

  return false
}

/**
 * Product rule: changing RSVP away from Going never refunds membership
 * credits or event-fee payments (premium or otherwise).
 */
export function resolveRsvpCancelRefund(): {
  refundCredit: boolean
  refundPayment: boolean
  creditDelta: number
} {
  return {
    refundCredit: false,
    refundPayment: false,
    creditDelta: 0,
  }
}

export const PREMIUM_RSVP_NO_REFUND_COPY =
  'Changing your RSVP will not refund membership credits or event fees.'

/** Visual state for the Going button once an RSVP exists. */
export function resolveGoingButtonClassName(input: {
  isActive: boolean
  goingBlocked: boolean
  hasExistingStatus: boolean
  primaryClassName: string
  secondaryClassName: string
  disabledClassName: string
}): string {
  if (input.goingBlocked) return input.disabledClassName
  // Selected Going, or no RSVP yet → primary CTA.
  if (input.isActive || !input.hasExistingStatus) {
    return input.primaryClassName
  }
  // After Maybe / Not going, Going returns to the non-selected look.
  return input.secondaryClassName
}
