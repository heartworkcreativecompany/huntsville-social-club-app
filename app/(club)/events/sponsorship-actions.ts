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
import {
  findOrCreateSponsor,
  isSponsorshipEligibleEventType,
  syncSponsorshipPurchaseToEventSponsors,
} from '@/lib/event-sponsors'

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
    isSponsorshipEligibleEventType(event.event_type)

  if (!eligible || event.event_type === 'standard_event') {
    return { error: 'This event is not eligible for sponsorship.' }
  }

  const { data: existingOwn } = await supabase
    .from('event_sponsorships')
    .select('id, status')
    .eq('event_id', input.eventId)
    .eq('sponsor_user_id', viewer.userId)
    .in('status', ['pending_payment', 'paid', 'approved', 'claimed'])
    .maybeSingle()

  if (existingOwn) {
    return {
      error:
        'You already have an active sponsorship reservation or purchase for this event.',
    }
  }

  const admin = createAdminClient()
  const sponsorClient = admin ?? supabase
  const createdSponsor = await findOrCreateSponsor(sponsorClient, {
    businessName,
    contactEmail: input.contactEmail?.trim() || viewer.email,
  })

  if ('error' in createdSponsor) {
    return { error: createdSponsor.error }
  }

  const { data: sponsorship, error: insertError } = await supabase
    .from('event_sponsorships')
    .insert({
      event_id: input.eventId,
      sponsor_user_id: viewer.userId,
      sponsor_id: createdSponsor.sponsor.id,
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
        'Could not reserve sponsorship. Please try again.',
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

  const { data: sponsorship } = await admin
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
    .select('id, event_id, business_name, contact_email, logo_url, sponsor_id')
    .maybeSingle()

  if (!sponsorship) {
    return
  }

  const synced = await syncSponsorshipPurchaseToEventSponsors(admin, {
    eventId: sponsorship.event_id,
    businessName: sponsorship.business_name,
    contactEmail: sponsorship.contact_email,
    logoUrl: sponsorship.logo_url,
  })

  if ('sponsorId' in synced && sponsorship.sponsor_id !== synced.sponsorId) {
    await admin
      .from('event_sponsorships')
      .update({
        sponsor_id: synced.sponsorId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sponsorship.id)
  }
}
