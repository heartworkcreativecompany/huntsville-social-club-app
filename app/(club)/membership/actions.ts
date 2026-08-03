'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
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
  // Guard: only STRIPE_SECRET_KEY is required. Live price IDs are provided by
  // lib/stripe/config.ts (STRIPE_LIVE_PRICE_IDS) and must not block checkout.
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
    const secretKey = process.env.STRIPE_SECRET_KEY?.trim() ?? ''
    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? ''
    const secretMode = secretKey.startsWith('sk_live_')
      ? 'sk_live_'
      : secretKey.startsWith('sk_test_')
        ? 'sk_test_'
        : secretKey
          ? `unknown_prefix:${secretKey.slice(0, 3)}_`
          : 'missing'
    const publishableMode = publishableKey.startsWith('pk_live_')
      ? 'pk_live_'
      : publishableKey.startsWith('pk_test_')
        ? 'pk_test_'
        : publishableKey
          ? `unknown_prefix:${publishableKey.slice(0, 3)}_`
          : 'missing'

    const priceId = stripePriceIdForTier(tier)

    // Temporary diagnostics — remove after checkout is verified.
    // Log before any Stripe / URL helper work so Vercel still captures key/price context
    // when getOrCreateStripeCustomer or appBaseUrl throws.
    let requestOrigin: string | null = null
    try {
      const headerStore = await headers()
      requestOrigin =
        headerStore.get('origin') ?? headerStore.get('referer') ?? null
    } catch {
      requestOrigin = null
    }

    console.info('[membership_checkout] start', {
      tier,
      priceId,
      mode: 'subscription',
      hasSecretKey: Boolean(secretKey),
      secretMode,
      publishableMode,
      requestOrigin,
    })

    const stripe = getStripe()
    const customerId = await getOrCreateStripeCustomer(supabase, {
      userId: viewer.userId,
      email: viewer.email,
    })

    const baseUrl = appBaseUrl()
    const trialDays = optionalCheckoutTrialDays()
    const successUrl = `${baseUrl}/upgrade?checkout=success&session_id={CHECKOUT_SESSION_ID}`
    const cancelUrl = `${baseUrl}/upgrade?checkout=cancelled`

    console.info('[membership_checkout] before sessions.create', {
      tier,
      priceId,
      customerId,
      hasSecretKey: Boolean(secretKey),
      secretMode,
      publishableMode,
      requestOrigin,
      baseUrl,
      success_url: successUrl,
      cancel_url: cancelUrl,
      trialDays: trialDays ?? null,
      mode: 'subscription',
    })

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
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

    console.info('[membership_checkout] after sessions.create', {
      tier,
      priceId,
      sessionId: session.id,
      hasUrl: Boolean(session.url),
    })

    if (!session.url) {
      console.error('[membership_checkout] sessions.create returned no url', {
        tier,
        priceId,
        sessionId: session.id,
      })
      return { error: 'Could not start checkout.' }
    }

    return { url: session.url }
  } catch (error) {
    const stripeError =
      error && typeof error === 'object'
        ? (error as {
            message?: string
            type?: string
            code?: string
            param?: string
            statusCode?: number
            raw?: unknown
            rawType?: string
          })
        : null

    console.error('[membership_checkout] sessions.create failed', {
      message:
        stripeError?.message ??
        (error instanceof Error ? error.message : String(error)),
      type: stripeError?.type ?? null,
      code: stripeError?.code ?? null,
      param: stripeError?.param ?? null,
      statusCode: stripeError?.statusCode ?? null,
      name: error instanceof Error ? error.name : typeof error,
      rawType: stripeError?.rawType ?? null,
      raw: stripeError?.raw ?? null,
      stack: error instanceof Error ? error.stack : null,
    })

    return { error: 'Could not start checkout.' }
  }
}

export async function createBillingPortalSession() {
  // Same gate as checkout — secret key only; no price-env requirement.
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
    console.error('[billing_portal]', error)
    return { error: 'Could not open billing portal.' }
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
