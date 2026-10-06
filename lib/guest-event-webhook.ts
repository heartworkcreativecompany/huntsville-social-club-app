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
    throw new Error('Could not record guest payment.')
  }
  return data
}

export async function applyGuestCheckoutSessionCompleted(
  admin: AdminClient,
  session: Stripe.Checkout.Session
): Promise<void> {
  if (session.payment_status !== 'paid') return

  const registrationId = registrationIdFromSession(session)
  if (!registrationId) return

  const row = await loadMatchingRegistration(admin, registrationId, session.id)
  if (!row) return

  if (row.status === 'paid') return

  if (row.status === 'cancelled' || row.status === 'refunded') {
    console.warn(`[guest_event_fee] ${row.id}`)
    return
  }

  if (row.status !== 'pending_payment' && row.status !== 'expired') return

  const { error } = await admin
    .from('guest_event_registrations')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      stripe_payment_intent_id: paymentIntentId(session),
    })
    .eq('id', row.id)
    .in('status', ['pending_payment', 'expired'])

  if (error) {
    throw new Error('Could not record guest payment.')
  }
}

export async function applyGuestCheckoutSessionExpired(
  admin: AdminClient,
  session: Stripe.Checkout.Session
): Promise<void> {
  const registrationId = registrationIdFromSession(session)
  if (!registrationId) return

  const row = await loadMatchingRegistration(admin, registrationId, session.id)
  if (!row || row.status !== 'pending_payment') return

  const { error } = await admin
    .from('guest_event_registrations')
    .update({ status: 'expired' })
    .eq('id', row.id)
    .eq('status', 'pending_payment')

  if (error) {
    throw new Error('Could not record guest payment.')
  }
}
