import type Stripe from 'stripe'
import {
  isPaidMembershipTier,
  tierFromStripePriceId,
  type PaidMembershipTier,
} from '@/lib/stripe/config'

function stripePriceIdFromField(
  price: Stripe.Price | Stripe.DeletedPrice | string | null | undefined
): string | null {
  if (!price) return null
  if (typeof price === 'string') {
    return price.startsWith('price_') ? price : null
  }
  if ('deleted' in price && price.deleted) return null
  if (typeof price.id === 'string' && price.id.startsWith('price_')) {
    return price.id
  }
  return null
}

/**
 * Webhook payloads may leave `price` as an ID string instead of an expanded
 * Price object. `.price?.id` is undefined in that case, which dropped Connect
 * mapping while still writing `subscription_status: active`.
 */
export function primarySubscriptionPriceId(
  subscription: Stripe.Subscription
): string | null {
  const items = subscription.items?.data ?? []
  for (const item of items) {
    const fromPrice = stripePriceIdFromField(item.price)
    if (fromPrice) return fromPrice

    const planId = item.plan?.id
    if (typeof planId === 'string' && planId.startsWith('price_')) {
      return planId
    }
  }
  return null
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
  const fromPrice = tierFromStripePriceId(primarySubscriptionPriceId(subscription))
  if (fromPrice) return fromPrice

  const fromSubscriptionMeta = paidTierFromMetadata(subscription.metadata)
  if (fromSubscriptionMeta) return fromSubscriptionMeta

  if (fallbackTier && isPaidMembershipTier(fallbackTier)) {
    return fallbackTier
  }

  return null
}
