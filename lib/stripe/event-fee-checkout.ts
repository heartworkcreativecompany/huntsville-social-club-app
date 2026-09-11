import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import type { Database } from '@/lib/database.types'
import {
  EVENT_AT_CAPACITY_MESSAGE,
  isEventAtCapacity,
} from '@/lib/event-attendance'
import { appendRegistrationLedger } from '@/lib/membership-billing-cycles'
import { appBaseUrl, getStripe, isStripeConfigured } from '@/lib/stripe/config'
import { getOrCreateStripeCustomer } from '@/lib/stripe/customer'
import {
  deletePendingRsvpAnswer,
  loadPendingRsvpAnswer,
} from '@/lib/event-rsvp-pending-answer'
import {
  goingPayloadWithPendingAnswer,
  isMissingRsvpAnswerColumnError,
  omitRsvpAnswerField,
  pendingRsvpAnswerMayBeDeleted,
  resolvePendingRsvpAnswerDisposition,
} from '@/lib/event-rsvp-question'

export const EVENT_FEE_CHECKOUT_TYPE = 'event_fee'

export type EventFeeCheckoutSessionInput = {
  eventId: string
  eventTitle: string
  feeCents: number
  userId: string
  customerId: string
  successUrl?: string
  cancelUrl?: string
}

/**
 * Build Stripe Checkout Session params for a one-off event fee.
 * Always uses inline price_data so amounts can vary per event.
 */
export function buildEventFeeCheckoutSessionParams(
  input: EventFeeCheckoutSessionInput
): Stripe.Checkout.SessionCreateParams {
  const baseUrl = appBaseUrl()
  const successUrl =
    input.successUrl ??
    `${baseUrl}/events/${input.eventId}?checkout=success`
  const cancelUrl =
    input.cancelUrl ??
    `${baseUrl}/events/${input.eventId}?checkout=cancel`

  const metadata = {
    checkout_type: EVENT_FEE_CHECKOUT_TYPE,
    type: EVENT_FEE_CHECKOUT_TYPE,
    event_id: input.eventId,
    user_id: input.userId,
    member_id: input.userId,
    fee_cents: String(input.feeCents),
  }

  return {
    customer: input.customerId,
    mode: 'payment',
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: input.feeCents,
          product_data: {
            name: input.eventTitle,
            description: 'Event registration fee',
          },
        },
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: input.userId,
    metadata,
    payment_intent_data: {
      metadata,
    },
  }
}

export function isEventFeeCheckoutSession(session: {
  mode?: string | null
  metadata?: Record<string, string> | null
}): boolean {
  if (session.mode !== 'payment') return false
  const type =
    session.metadata?.type ?? session.metadata?.checkout_type ?? null
  return type === EVENT_FEE_CHECKOUT_TYPE
}

export async function createEventFeeCheckoutSession(input: {
  supabase: SupabaseClient<Database>
  eventId: string
  eventTitle: string
  feeCents: number
  userId: string
  email: string | null
}): Promise<{ url: string; sessionId: string } | { error: string }> {
  if (!isStripeConfigured()) {
    return { error: 'Payment checkout is not configured.' }
  }

  if (!Number.isFinite(input.feeCents) || input.feeCents <= 0) {
    return {
      error: 'This event does not have a registration fee configured.',
    }
  }

  try {
    const stripe = getStripe()
    const customerId = await getOrCreateStripeCustomer(input.supabase, {
      userId: input.userId,
      email: input.email,
    })

    const session = await stripe.checkout.sessions.create(
      buildEventFeeCheckoutSessionParams({
        eventId: input.eventId,
        eventTitle: input.eventTitle,
        feeCents: input.feeCents,
        userId: input.userId,
        customerId,
      })
    )

    if (!session.url) {
      return { error: 'Could not start event fee checkout.' }
    }

    return { url: session.url, sessionId: session.id }
  } catch (error) {
    console.error('[event_fee_checkout]', error)
    return { error: 'Could not start event fee checkout.' }
  }
}

/**
 * Confirm Going after a successful event-fee Checkout Session.
 * Idempotent: safe if the attendee is already Going + paid.
 */
export async function markEventFeePaidFromCheckout(session: {
  id: string
  metadata: Record<string, string> | null
  payment_intent?: string | { id: string } | null
  payment_status?: string | null
}): Promise<{ ok: true } | { error: string }> {
  if (!isEventFeeCheckoutSession({ mode: 'payment', metadata: session.metadata })) {
    return { error: 'Not an event fee checkout session.' }
  }

  // Only confirm after a completed/paid session (webhook should already be
  // checkout.session.completed; still guard unpaid edge cases).
  if (
    session.payment_status &&
    session.payment_status !== 'paid' &&
    session.payment_status !== 'no_payment_required'
  ) {
    return { error: 'Checkout session is not paid.' }
  }

  const eventId = session.metadata?.event_id
  const userId =
    session.metadata?.user_id || session.metadata?.member_id || null

  if (!eventId || !userId) {
    return { error: 'Missing event_id or member_id in checkout metadata.' }
  }

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const admin = createAdminClient()
  if (!admin) {
    return { error: 'Admin client unavailable.' }
  }

  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent && typeof session.payment_intent === 'object'
        ? session.payment_intent.id
        : null

  const { data: existing } = await admin
    .from('event_attendees')
    .select('status, payment_status, rsvp_answer')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .maybeSingle()

  const pendingAnswer = await loadPendingRsvpAnswer(admin, {
    eventId,
    userId,
  })
  const disposition = resolvePendingRsvpAnswerDisposition({
    existingAnswer: existing?.rsvp_answer,
    pendingAnswer,
  })

  if (
    existing?.status === 'going' &&
    (existing.payment_status === 'paid' ||
      existing.payment_status === 'waived' ||
      existing.payment_status === 'not_required')
  ) {
    if (disposition.kind === 'transfer') {
      const { data, error } = await admin
        .from('event_attendees')
        .update({ rsvp_answer: disposition.rsvp_answer })
        .eq('event_id', eventId)
        .eq('user_id', userId)
        .select('rsvp_answer')

      const omittedAnswerColumn = Boolean(
        error && isMissingRsvpAnswerColumnError(error)
      )
      const writtenRows = data ?? []
      if (
        pendingRsvpAnswerMayBeDeleted({
          disposition,
          writtenAnswer: writtenRows[0]?.rsvp_answer,
          omittedAnswerColumn,
          rowsAffected: writtenRows.length,
          writeError: error,
        })
      ) {
        await deletePendingRsvpAnswer(admin, { eventId, userId })
      }
    } else if (disposition.kind === 'keep_existing') {
      await deletePendingRsvpAnswer(admin, { eventId, userId })
    }
    return { ok: true }
  }

  if (existing?.status !== 'going') {
    const { count: goingCount, error: countError } = await admin
      .from('event_attendees')
      .select('user_id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('status', 'going')

    if (countError) {
      return { error: countError.message }
    }

    const { data: event } = await admin
      .from('events')
      .select('attendance_max')
      .eq('id', eventId)
      .maybeSingle()

    if (isEventAtCapacity(goingCount ?? 0, event?.attendance_max)) {
      return { error: EVENT_AT_CAPACITY_MESSAGE }
    }
  }

  const registeredAt = new Date().toISOString()
  const payload = goingPayloadWithPendingAnswer(
    {
      event_id: eventId,
      user_id: userId,
      status: 'going' as const,
      registration_method: 'paid_per_event',
      payment_status: 'paid',
      credit_consumed: false,
      credit_returned: false,
      registered_at: registeredAt,
      cancelled_at: null,
    },
    pendingAnswer,
    existing?.rsvp_answer
  )

  const writeGoing = (nextPayload: typeof payload) =>
    existing
      ? admin
          .from('event_attendees')
          .update(nextPayload)
          .eq('event_id', eventId)
          .eq('user_id', userId)
          .select('rsvp_answer')
      : admin.from('event_attendees').insert(nextPayload).select('rsvp_answer')

  let writeResult = await writeGoing(payload)
  let omittedAnswerColumn = false
  if (
    writeResult.error &&
    isMissingRsvpAnswerColumnError(writeResult.error) &&
    'rsvp_answer' in payload
  ) {
    omittedAnswerColumn = true
    writeResult = await writeGoing(omitRsvpAnswerField(payload))
  }

  if (writeResult.error) {
    return { error: writeResult.error.message }
  }

  const writtenRows = writeResult.data ?? []
  if (writtenRows.length < 1) {
    return { error: 'Could not save event registration.' }
  }

  const writtenAnswer =
    typeof writtenRows[0]?.rsvp_answer === 'string'
      ? writtenRows[0].rsvp_answer
      : existing?.rsvp_answer ?? null

  if (
    pendingRsvpAnswerMayBeDeleted({
      disposition,
      writtenAnswer,
      omittedAnswerColumn,
      rowsAffected: writtenRows.length,
      writeError: writeResult.error,
    })
  ) {
    await deletePendingRsvpAnswer(admin, { eventId, userId })
  }

  await appendRegistrationLedger(admin, {
    userId,
    eventId,
    action: 'payment_complete',
    registrationMethod: 'paid_per_event',
    creditDelta: 0,
    metadata: {
      payment_status: 'paid',
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: paymentIntentId,
      fee_cents: session.metadata?.fee_cents ?? null,
    },
  })

  return { ok: true }
}
