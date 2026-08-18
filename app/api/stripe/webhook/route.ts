import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/stripe/config'
import {
  downgradeMembershipFromStripe,
  resolveUserIdForSubscription,
  resolveUserIdFromStripeMetadata,
  syncStripeSubscription,
} from '@/lib/stripe/sync-subscription'
import { applyIdentityVerificationSession } from '@/lib/stripe/identity'
import {
  hasProcessedStripeEvent,
  markStripeEventProcessed,
} from '@/lib/stripe/webhook-idempotency'
import { constructVerifiedStripeEvent } from '@/lib/stripe/verify-webhook-signature'
import { subscriptionIdFromInvoice } from '@/lib/stripe/invoice-helpers'

export const runtime = 'nodejs'

async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  const admin = createAdminClient()
  if (!admin) {
    throw new Error('Admin client unavailable.')
  }

  const stripe = getStripe()

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session

      if (
        session.mode === 'payment' &&
        session.metadata?.checkout_type === 'event_sponsorship'
      ) {
        const { markSponsorshipPaidFromCheckout } = await import(
          '@/app/(club)/events/sponsorship-actions'
        )
        await markSponsorshipPaidFromCheckout(session)
        return
      }

      if (
        session.mode === 'payment' &&
        (session.metadata?.type === 'event_fee' ||
          session.metadata?.checkout_type === 'event_fee')
      ) {
        const { markEventFeePaidFromCheckout } = await import(
          '@/lib/stripe/event-fee-checkout'
        )
        const result = await markEventFeePaidFromCheckout(session)
        if ('error' in result) {
          throw new Error(result.error)
        }
        return
      }

      if (session.mode !== 'subscription') return

      const userId =
        resolveUserIdFromStripeMetadata(session.metadata) ??
        (typeof session.client_reference_id === 'string' &&
        session.client_reference_id.length > 0
          ? session.client_reference_id
          : null)

      const subscriptionRef = session.subscription
      const subscriptionId =
        typeof subscriptionRef === 'string'
          ? subscriptionRef
          : subscriptionRef &&
              typeof subscriptionRef === 'object' &&
              'id' in subscriptionRef
            ? subscriptionRef.id
            : null

      if (!userId || !subscriptionId) {
        return
      }

      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      await syncStripeSubscription(admin, {
        userId,
        subscription,
        options: { startEntitlementCycle: true },
        productTierFallback:
          typeof session.metadata?.product_tier === 'string'
            ? session.metadata.product_tier
            : null,
      })
      return
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription
      const userId = await resolveUserIdForSubscription(subscription)
      if (!userId) return

      await syncStripeSubscription(admin, {
        userId,
        subscription,
      })
      return
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      const userId = await resolveUserIdForSubscription(subscription)
      if (!userId) return

      await downgradeMembershipFromStripe(admin, userId, subscription)
      return
    }

    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice
      if (invoice.billing_reason !== 'subscription_cycle') return

      const subscriptionId = subscriptionIdFromInvoice(invoice)
      if (!subscriptionId || typeof subscriptionId !== 'string') return

      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      const userId = await resolveUserIdForSubscription(subscription)
      if (!userId) return

      await syncStripeSubscription(admin, {
        userId,
        subscription,
        options: { renewEntitlementCycle: true },
      })
      return
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      const subscriptionId = subscriptionIdFromInvoice(invoice)
      if (!subscriptionId || typeof subscriptionId !== 'string') return

      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      const userId = await resolveUserIdForSubscription(subscription)
      if (!userId) return

      await syncStripeSubscription(admin, {
        userId,
        subscription,
      })
      return
    }

    case 'identity.verification_session.verified':
    case 'identity.verification_session.requires_input':
    case 'identity.verification_session.processing':
    case 'identity.verification_session.canceled': {
      const session = event.data.object as Stripe.Identity.VerificationSession
      await applyIdentityVerificationSession(admin, session)
      return
    }

    default:
      return
  }
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    return NextResponse.json(
      { error: 'Stripe webhook not configured.' },
      { status: 503 }
    )
  }

  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature.' }, { status: 400 })
  }

  const body = await request.text()
  const stripe = getStripe()

  let event: Stripe.Event
  try {
    event = constructVerifiedStripeEvent({
      rawBody: body,
      signatureHeader: signature,
      webhookSecret,
      stripe,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Invalid webhook signature.'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  if (await hasProcessedStripeEvent(event.id)) {
    return NextResponse.json({ received: true, duplicate: true })
  }

  try {
    await handleStripeEvent(event)
    await markStripeEventProcessed(event.id, event.type)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Webhook handler failed.'
    console.error('[stripe webhook]', event.type, message)
    return NextResponse.json({ error: message }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
