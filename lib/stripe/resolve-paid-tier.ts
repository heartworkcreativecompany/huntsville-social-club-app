import type Stripe from 'stripe'
import {
  isPaidMembershipTier,
  tierFromStripePriceId,
  type PaidMembershipTier,
} from '@/lib/stripe/config'

function primaryPriceId(subscription: Stripe.Subscription): string | null {
  return subscription.items.data[0]?.price?.id ?? null
}

function paidTierFromMetadata(
  metadata: Stripe.Metadata | null | undefined
): PaidMembershipTier | null {
  const raw = metadata?.product_tier
  if (isPaidMembershipTier(raw ?? '')) {
    return raw as PaidMembershipTier
  }
  return null
}

/** Resolve paid tier from Stripe price ID, then subscription/session metadata. */
export function resolvePaidTierForSubscription(
  subscription: Stripe.Subscription,
  fallbackTier?: string | null
): PaidMembershipTier | null {
  const fromPrice = tierFromStripePriceId(primaryPriceId(subscription))
  if (fromPrice) return fromPrice

  const fromSubscriptionMeta = paidTierFromMetadata(subscription.metadata)
  if (fromSubscriptionMeta) return fromSubscriptionMeta

  if (fallbackTier && isPaidMembershipTier(fallbackTier)) {
    return fallbackTier
  }

  return null
}

export function primarySubscriptionPriceId(
  subscription: Stripe.Subscription
): string | null {
  return primaryPriceId(subscription)
}
