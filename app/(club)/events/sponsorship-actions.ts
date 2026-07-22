'use server'

import { createClient } from '@/lib/supabase/server'
import { getViewer } from '@/lib/viewer'
import {
  EVENT_SPONSORSHIP_AMOUNT_CENTS,
  EVENT_SPONSORSHIP_TICKET_COUNT,
} from '@/lib/membership-tier-config'
import {
  appBaseUrl,
  getStripe,
  stripeSponsorshipPriceId,
} from '@/lib/stripe/config'
import { getOrCreateStripeCustomer } from '@/lib/stripe/customer'
import { createAdminClient } from '@/lib/supabase/admin'

export async function createEventSponsorshipCheckout(input: {
  eventId: string
  businessName: string
  contactEmail?: string
}) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return { error: 'Stripe is not configured.' }
  }

  const viewer = await getViewer()
  if (!viewer?.canAccessApp) {
    return { error: 'Membership approval is required.' }
  }

  const businessName = input.businessName.trim()
  if (!businessName) {
    return { error: 'Enter a business name for the sponsorship.' }
  }

  const supabase = await createClient()
  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, title, status, event_type, sponsorship_eligible')
    .eq('id', input.eventId)
    .maybeSingle()

  if (eventError || !event) {
    return { error: eventError?.message ?? 'Event not found.' }
  }

  if (event.status !== 'published') {
    return { error: 'Only published events can be sponsored.' }
  }

  const eligible =
    event.sponsorship_eligible === true ||
    event.event_type === 'circle_social' ||
    event.event_type === 'premium_event'

  if (!eligible || event.event_type === 'standard_event') {
    return { error: 'This event is not eligible for sponsorship.' }
  }

  const { data: existing } = await supabase
    .from('event_sponsorships')
    .select('id, status')
    .eq('event_id', input.eventId)
    .in('status', ['pending_payment', 'paid', 'approved', 'claimed'])
    .maybeSingle()

  if (existing) {
    return {
      error: 'Sponsorship for this event has already been claimed or reserved.',
    }
  }

  const { data: sponsorship, error: insertError } = await supabase
    .from('event_sponsorships')
    .insert({
      event_id: input.eventId,
      sponsor_user_id: viewer.userId,
      business_name: businessName,
      contact_email: input.contactEmail?.trim() || viewer.email,
      status: 'pending_payment',
      amount_cents: EVENT_SPONSORSHIP_AMOUNT_CENTS,
      ticket_count: EVENT_SPONSORSHIP_TICKET_COUNT,
    })
    .select('id')
    .single()

  if (insertError || !sponsorship) {
    return {
      error:
        insertError?.message ??
        'Could not reserve sponsorship. It may already be claimed.',
    }
  }

  try {
    const stripe = getStripe()
    const customerId = await getOrCreateStripeCustomer(supabase, {
      userId: viewer.userId,
      email: viewer.email,
    })
    const baseUrl = appBaseUrl()
    const priceId = stripeSponsorshipPriceId()

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'payment',
      line_items: priceId
        ? [{ price: priceId, quantity: 1 }]
        : [
            {
              quantity: 1,
              price_data: {
                currency: 'usd',
                unit_amount: EVENT_SPONSORSHIP_AMOUNT_CENTS,
                product_data: {
                  name: `Event sponsorship — ${event.title}`,
                  description: `${EVENT_SPONSORSHIP_TICKET_COUNT} tickets, logo placement, and marketing table`,
                },
              },
            },
          ],
      success_url: `${baseUrl}/events/${input.eventId}?sponsorship=success`,
      cancel_url: `${baseUrl}/events/${input.eventId}?sponsorship=cancelled`,
      client_reference_id: viewer.userId,
      metadata: {
        checkout_type: 'event_sponsorship',
        user_id: viewer.userId,
        event_id: input.eventId,
        sponsorship_id: sponsorship.id,
      },
      payment_intent_data: {
        metadata: {
          checkout_type: 'event_sponsorship',
          user_id: viewer.userId,
          event_id: input.eventId,
          sponsorship_id: sponsorship.id,
        },
      },
    })

    if (!session.url) {
      return { error: 'Could not start sponsorship checkout.' }
    }

    await supabase
      .from('event_sponsorships')
      .update({
        stripe_checkout_session_id: session.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sponsorship.id)

    return { url: session.url }
  } catch (error) {
    console.error('[sponsorship_checkout]', error)
    await supabase
      .from('event_sponsorships')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', sponsorship.id)
    return { error: 'Could not start sponsorship checkout.' }
  }
}

export async function markSponsorshipPaidFromCheckout(session: {
  id: string
  metadata: Record<string, string> | null
  payment_intent?: string | { id: string } | null
}) {
  const sponsorshipId = session.metadata?.sponsorship_id
  if (!sponsorshipId || session.metadata?.checkout_type !== 'event_sponsorship') {
    return
  }

  const admin = createAdminClient()
  if (!admin) return

  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent && typeof session.payment_intent === 'object'
        ? session.payment_intent.id
        : null

  await admin
    .from('event_sponsorships')
    .update({
      status: 'paid',
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: paymentIntentId,
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', sponsorshipId)
    .in('status', ['pending_payment', 'paid'])
}
