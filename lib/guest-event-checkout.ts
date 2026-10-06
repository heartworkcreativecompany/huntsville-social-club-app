'use server'

import type Stripe from 'stripe'
import { MARKETING_HOST, marketingOrigin } from '@/lib/hostnames'
import { GUEST_EVENT_FEE_CHECKOUT_TYPE } from '@/lib/guest-event-fee'
import { getStripe, isStripeConfigured } from '@/lib/stripe/config'
import { createAdminClient } from '@/lib/supabase/admin'

const HOLD_MINUTES = 30
const CANONICAL_MARKETING_ORIGIN = 'https://huntsvillesocialclub.com'

type GuestCheckoutErrorCode =
  | 'full'
  | 'already_registered'
  | 'not_available'
  | 'rate_limited'
  | 'invalid_input'
  | 'error'

type GuestCheckoutResult = { url: string } | { error: GuestCheckoutErrorCode }

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const RESERVE_CODES = new Set<GuestCheckoutErrorCode>([
  'full',
  'already_registered',
  'not_available',
  'rate_limited',
  'invalid_input',
  'error',
])

function guestCheckoutOrigin(): string {
  const origin = marketingOrigin().replace(/\/$/, '')
  try {
    const host = new URL(origin).hostname
    if (host === MARKETING_HOST) return origin
  } catch {
    // NEXT_PUBLIC_MARKETING_URL is not the public marketing host.
  }
  return CANONICAL_MARKETING_ORIGIN
}

function honeypotFilled(website: unknown): boolean {
  if (website == null) return false
  if (typeof website === 'string') return website.trim().length > 0
  return true
}

function validateGuestCheckoutInput(input: {
  eventId: unknown
  fullName: unknown
  email: unknown
  rsvpAnswer: unknown
}):
  | { eventId: string; fullName: string; email: string; rsvpAnswer: string | null }
  | { error: 'invalid_input' } {
  if (typeof input.eventId !== 'string' || !UUID_PATTERN.test(input.eventId)) {
    return { error: 'invalid_input' }
  }
  if (typeof input.fullName !== 'string') return { error: 'invalid_input' }
  const fullName = input.fullName.trim()
  if (fullName.length < 1 || fullName.length > 120) {
    return { error: 'invalid_input' }
  }
  if (typeof input.email !== 'string') return { error: 'invalid_input' }
  const email = input.email.trim().toLowerCase()
  if (email.length > 320 || !EMAIL_PATTERN.test(email)) {
    return { error: 'invalid_input' }
  }

  let rsvpAnswer: string | null = null
  if (input.rsvpAnswer != null && input.rsvpAnswer !== '') {
    if (typeof input.rsvpAnswer !== 'string') return { error: 'invalid_input' }
    rsvpAnswer = input.rsvpAnswer.trim()
    if (rsvpAnswer.length === 0) rsvpAnswer = null
    if (rsvpAnswer && rsvpAnswer.length > 300) return { error: 'invalid_input' }
  }

  return { eventId: input.eventId, fullName, email, rsvpAnswer }
}

function reserveCode(value: unknown): GuestCheckoutErrorCode | 'ok' | null {
  if (!value || typeof value !== 'object') return null
  const code = (value as { code?: unknown }).code
  if (code === 'ok') return 'ok'
  if (typeof code === 'string' && RESERVE_CODES.has(code as GuestCheckoutErrorCode)) {
    return code as GuestCheckoutErrorCode
  }
  return null
}

async function releaseGuestHold(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  registrationId: string
): Promise<void> {
  try {
    await admin
      .from('guest_event_registrations')
      .update({ status: 'expired' })
      .eq('id', registrationId)
      .eq('status', 'pending_payment')
  } catch {
    // The hold also ends when expires_at passes. Do not log provider details.
  }
}

export async function startGuestEventCheckout(input: {
  eventId: string
  fullName: string
  email: string
  rsvpAnswer?: string | null
  website?: string | null
}): Promise<GuestCheckoutResult> {
  if (honeypotFilled(input.website)) {
    return { error: 'error' }
  }

  const validated = validateGuestCheckoutInput({
    eventId: input.eventId,
    fullName: input.fullName,
    email: input.email,
    rsvpAnswer: input.rsvpAnswer ?? null,
  })
  if ('error' in validated) return validated

  if (!isStripeConfigured()) return { error: 'error' }

  const admin = createAdminClient()
  if (!admin) return { error: 'error' }

  const { data: event, error: eventError } = await admin
    .from('events')
    .select('id, title, rsvp_question_required')
    .eq('id', validated.eventId)
    .maybeSingle()

  if (eventError || !event) return { error: 'not_available' }

  if (event.rsvp_question_required && !validated.rsvpAnswer) {
    return { error: 'invalid_input' }
  }

  const reserved = await admin.rpc('reserve_guest_event_seat', {
    p_event_id: validated.eventId,
    p_full_name: validated.fullName,
    p_email: validated.email,
    p_rsvp_answer: validated.rsvpAnswer,
    p_hold_minutes: HOLD_MINUTES,
  })

  if (reserved.error) return { error: 'error' }

  let reserveData: unknown = reserved.data
  if (typeof reserveData === 'string') {
    try {
      reserveData = JSON.parse(reserveData) as unknown
    } catch {
      return { error: 'error' }
    }
  }

  const code = reserveCode(reserveData)
  if (code !== 'ok') {
    return { error: code ?? 'error' }
  }

  const payload = reserveData as {
    id?: unknown
    amount_cents?: unknown
  }
  const registrationId = typeof payload.id === 'string' ? payload.id : ''
  const amountCents =
    typeof payload.amount_cents === 'number' ? payload.amount_cents : Number(payload.amount_cents)
  if (!UUID_PATTERN.test(registrationId) || !Number.isInteger(amountCents) || amountCents <= 0) {
    if (registrationId) await releaseGuestHold(admin, registrationId)
    return { error: 'error' }
  }

  const origin = guestCheckoutOrigin()
  const title = event.title?.trim() || 'Event registration'
  const expiresAt = Math.floor(Date.now() / 1000) + HOLD_MINUTES * 60
  const metadata: Record<string, string> = {
    checkout_type: GUEST_EVENT_FEE_CHECKOUT_TYPE,
    guest_registration_id: registrationId,
    event_id: validated.eventId,
  }
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: 'payment',
    customer_email: validated.email,
    customer_creation: 'if_required',
    expires_at: expiresAt,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: amountCents,
          product_data: {
            name: title,
          },
        },
      },
    ],
    success_url: `${origin}/events/${validated.eventId}?guest_checkout=success`,
    cancel_url: `${origin}/events/${validated.eventId}?guest_checkout=cancelled`,
    metadata,
    payment_intent_data: { metadata },
  }

  let session: Stripe.Checkout.Session
  try {
    session = await getStripe().checkout.sessions.create(params, {
      idempotencyKey: registrationId,
    })
  } catch {
    await releaseGuestHold(admin, registrationId)
    console.error('[guest_event_checkout] checkout_failed')
    return { error: 'error' }
  }

  if (!session.url || !session.id) {
    await releaseGuestHold(admin, registrationId)
    console.error('[guest_event_checkout] checkout_failed')
    return { error: 'error' }
  }

  const saved = await admin
    .from('guest_event_registrations')
    .update({ stripe_checkout_session_id: session.id })
    .eq('id', registrationId)
    .eq('status', 'pending_payment')

  if (saved.error) {
    await releaseGuestHold(admin, registrationId)
    console.error('[guest_event_checkout] checkout_failed')
    return { error: 'error' }
  }

  return { url: session.url }
}
