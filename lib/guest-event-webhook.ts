import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { GUEST_EVENT_FEE_CHECKOUT_TYPE } from '@/lib/guest-event-fee'

type AdminClient = SupabaseClient<Database>

function registrationIdFromSession(session: Stripe.Checkout.Session): string | null {
  if (session.metadata?.checkout_type !== GUEST_EVENT_FEE_CHECKOUT_TYPE) return null
  const registrationId = session.metadata.guest_registration_id
  if (!registrationId || !session.id) return null
  return registrationId
}

function paymentIntentId(session: Stripe.Checkout.Session): string | null {
  const paymentIntent = session.payment_intent
  if (typeof paymentIntent === 'string') return paymentIntent
  if (paymentIntent && typeof paymentIntent === 'object' && 'id' in paymentIntent) {
    return paymentIntent.id
  }
  return null
}

function refuseGuestPayment(registrationId: string | null, reason: string): never {
  const detail = registrationId ? `${registrationId} ${reason}` : reason
  console.warn(`[guest_event_fee] ${detail}`)
  throw new Error(detail)
}

async function loadMatchingRegistration(
  admin: AdminClient,
  registrationId: string,
  sessionId: string
) {
  const { data, error } = await admin
    .from('guest_event_registrations')
    .select('id, status')
    .eq('id', registrationId)
    .eq('stripe_checkout_session_id', sessionId)
    .maybeSingle()

  if (error) {
    refuseGuestPayment(registrationId, 'update_failed')
  }
  return data
}

export async function applyGuestCheckoutSessionCompleted(
  admin: AdminClient,
  session: Stripe.Checkout.Session
): Promise<void> {
  if (session.metadata?.checkout_type !== GUEST_EVENT_FEE_CHECKOUT_TYPE) return

  const registrationId = registrationIdFromSession(session)
  if (!registrationId) refuseGuestPayment(null, 'missing_registration')

  if (session.payment_status !== 'paid') {
    refuseGuestPayment(registrationId, 'payment_not_paid')
  }

  const row = await loadMatchingRegistration(admin, registrationId, session.id)
  if (!row) refuseGuestPayment(registrationId, 'registration_not_found')

  if (row.status === 'paid') return

  if (row.status === 'cancelled' || row.status === 'refunded') {
    refuseGuestPayment(row.id, row.status)
  }

  if (row.status !== 'pending_payment' && row.status !== 'expired') {
    refuseGuestPayment(row.id, 'unexpected_status')
  }

  const { error, count } = await admin
    .from('guest_event_registrations')
    .update(
      {
        status: 'paid',
        paid_at: new Date().toISOString(),
        stripe_payment_intent_id: paymentIntentId(session),
      },
      { count: 'exact' }
    )
    .eq('id', row.id)
    .in('status', ['pending_payment', 'expired'])

  if (error || count !== 1) {
    refuseGuestPayment(row.id, 'update_failed')
  }
}

export async function applyGuestCheckoutSessionExpired(
  admin: AdminClient,
  session: Stripe.Checkout.Session
): Promise<void> {
  if (session.metadata?.checkout_type !== GUEST_EVENT_FEE_CHECKOUT_TYPE) return

  const registrationId = registrationIdFromSession(session)
  if (!registrationId) refuseGuestPayment(null, 'missing_registration')

  const row = await loadMatchingRegistration(admin, registrationId, session.id)
  if (!row) refuseGuestPayment(registrationId, 'registration_not_found')
  if (row.status !== 'pending_payment') return

  const { error, count } = await admin
    .from('guest_event_registrations')
    .update({ status: 'expired' }, { count: 'exact' })
    .eq('id', row.id)
    .eq('status', 'pending_payment')

  if (error || count !== 1) {
    refuseGuestPayment(row.id, 'update_failed')
  }
}
