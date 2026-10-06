import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { GUEST_EVENT_FEE_CHECKOUT_TYPE } from '@/lib/guest-event-fee'

type AdminClient = SupabaseClient<Database>

export type ReconcileGuestPaymentOutcome =
  | 'already_paid'
  | 'marked_paid'
  | 'would_mark_paid'
  | 'refused'

type GuestPaymentRow = {
  id: string
  event_id: string
  status: string
  stripe_checkout_session_id: string | null
}

export type GuestPaymentStripe = {
  checkout: {
    sessions: {
      retrieve: (id: string) => Promise<Stripe.Checkout.Session>
    }
  }
}

function paymentIntentId(session: Stripe.Checkout.Session): string | null {
  const paymentIntent = session.payment_intent
  if (typeof paymentIntent === 'string') return paymentIntent
  if (paymentIntent && typeof paymentIntent === 'object' && 'id' in paymentIntent) {
    return paymentIntent.id
  }
  return null
}

function sessionPaysThisRow(
  session: Stripe.Checkout.Session,
  row: GuestPaymentRow
): boolean {
  const metadata = session.metadata ?? {}
  return (
    session.status === 'complete' &&
    session.payment_status === 'paid' &&
    metadata.checkout_type === GUEST_EVENT_FEE_CHECKOUT_TYPE &&
    metadata.guest_registration_id === row.id &&
    metadata.event_id === row.event_id
  )
}

export async function reconcileGuestPayment(
  admin: AdminClient,
  stripe: GuestPaymentStripe,
  registrationId: string,
  options: { dryRun: boolean }
): Promise<ReconcileGuestPaymentOutcome> {
  const { data, error } = await admin
    .from('guest_event_registrations')
    .select('id, event_id, status, stripe_checkout_session_id')
    .eq('id', registrationId)
    .maybeSingle()

  if (error || !data) return 'refused'
  if (data.status === 'paid') return 'already_paid'
  if (data.status === 'cancelled' || data.status === 'refunded') return 'refused'
  if (data.status !== 'pending_payment' && data.status !== 'expired') return 'refused'
  if (!data.stripe_checkout_session_id) return 'refused'

  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.retrieve(data.stripe_checkout_session_id)
  } catch {
    return 'refused'
  }

  if (!sessionPaysThisRow(session, data)) return 'refused'
  if (options.dryRun) return 'would_mark_paid'

  const { error: updateError, count } = await admin
    .from('guest_event_registrations')
    .update(
      {
        status: 'paid',
        paid_at: new Date().toISOString(),
        stripe_payment_intent_id: paymentIntentId(session),
      },
      { count: 'exact' }
    )
    .eq('id', data.id)
    .in('status', ['pending_payment', 'expired'])

  if (updateError || count !== 1) return 'refused'
  return 'marked_paid'
}
