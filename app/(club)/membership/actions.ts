'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getViewer } from '@/lib/viewer'
import { parseMembershipBilling } from '@/lib/membership-systems'
import {
  appBaseUrl,
  getStripe,
  isPaidMembershipTier,
  isStripeConfigured,
  optionalCheckoutTrialDays,
  stripePriceIdForTier,
  type PaidMembershipTier,
} from '@/lib/stripe/config'
import { getOrCreateStripeCustomer } from '@/lib/stripe/customer'

function subscriptionBlocksNewCheckout(billing: ReturnType<typeof parseMembershipBilling>) {
  return (
    billing.subscription_status === 'active' ||
    billing.subscription_status === 'grace' ||
    billing.subscription_status === 'past_due'
  )
}

export async function createMembershipCheckoutSession(tierInput: string) {
  if (!isStripeConfigured()) {
    return { error: 'Stripe billing is not configured yet.' }
  }

  const viewer = await getViewer()
  if (!viewer) {
    return { error: 'You must be signed in.' }
  }

  if (!viewer.canAccessApp) {
    return { error: 'Membership approval is required before upgrading.' }
  }

  if (!isPaidMembershipTier(tierInput)) {
    return { error: 'Invalid membership plan selected.' }
  }

  const tier: PaidMembershipTier = tierInput
  const supabase = await createClient()
  const billing = parseMembershipBilling(viewer.profile?.membership_billing)

  if (billing.stripe_subscription_id && subscriptionBlocksNewCheckout(billing)) {
    return {
      error:
        'You already have an active subscription. Manage billing in your profile.',
    }
  }

  try {
    const stripe = getStripe()
    const customerId = await getOrCreateStripeCustomer(supabase, {
      userId: viewer.userId,
      email: viewer.email,
    })

    const baseUrl = appBaseUrl()
    const trialDays = optionalCheckoutTrialDays()

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [
        {
          price: stripePriceIdForTier(tier),
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/upgrade?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/upgrade?checkout=cancelled`,
      allow_promotion_codes: true,
      client_reference_id: viewer.userId,
      metadata: {
        user_id: viewer.userId,
        product_tier: tier,
      },
      subscription_data: {
        metadata: {
          user_id: viewer.userId,
          product_tier: tier,
        },
        ...(trialDays ? { trial_period_days: trialDays } : {}),
      },
    })

    if (!session.url) {
      return { error: 'Could not start checkout.' }
    }

    return { url: session.url }
  } catch (error) {
    console.error('[membership_checkout]', error)
    return { error: 'Could not start checkout.' }
  }
}

export async function createBillingPortalSession() {
  if (!isStripeConfigured()) {
    return { error: 'Stripe billing is not configured yet.' }
  }

  const viewer = await getViewer()
  if (!viewer) {
    return { error: 'You must be signed in.' }
  }

  const billing = parseMembershipBilling(viewer.profile?.membership_billing)
  if (!billing.stripe_customer_id) {
    return { error: 'No billing account found. Subscribe to a paid plan first.' }
  }

  try {
    const stripe = getStripe()
    const session = await stripe.billingPortal.sessions.create({
      customer: billing.stripe_customer_id,
      return_url: `${appBaseUrl()}/profile?billing=returned`,
    })

    if (!session.url) {
      return { error: 'Could not open billing portal.' }
    }

    return { url: session.url }
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : 'Could not open billing portal.',
    }
  }
}

/** @deprecated Use createMembershipCheckoutSession — dev-only fallback removed. */
export async function upgradeToInnerCircle() {
  const result = await createMembershipCheckoutSession('inner_circle')
  if (result.error) return { error: result.error }
  if (result.url) redirect(result.url)
  return { error: 'Could not start checkout.' }
}

/** @deprecated Use createMembershipCheckoutSession */
export async function upgradeToEliteCircle() {
  const result = await createMembershipCheckoutSession('elite_circle')
  if (result.error) return { error: result.error }
  if (result.url) redirect(result.url)
  return { error: 'Could not start checkout.' }
}

export async function startMembershipCheckout(tier: PaidMembershipTier) {
  const result = await createMembershipCheckoutSession(tier)
  if (result.error) {
    return { error: result.error }
  }
  if (result.url) {
    redirect(result.url)
  }
  return { error: 'Could not start checkout.' }
}

export async function openBillingPortal() {
  const result = await createBillingPortalSession()
  if (result.error) {
    return { error: result.error }
  }
  if (result.url) {
    redirect(result.url)
  }
  return { error: 'Could not open billing portal.' }
}
