import { describe, expect, it } from 'vitest'
import type Stripe from 'stripe'
import { resolvePaidTierForSubscription } from '@/lib/stripe/resolve-paid-tier'
import { STRIPE_LIVE_PRICE_IDS } from '@/lib/stripe/config'

function stubSubscription(input: {
  priceId?: string | null
  productTier?: string
}): Stripe.Subscription {
  return {
    id: 'sub_test',
    object: 'subscription',
    status: 'active',
    metadata: input.productTier
      ? { product_tier: input.productTier, user_id: 'user_1' }
      : { user_id: 'user_1' },
    items: {
      object: 'list',
      data: input.priceId
        ? [
            {
              id: 'si_test',
              object: 'subscription_item',
              price: { id: input.priceId, object: 'price' },
            } as Stripe.SubscriptionItem,
          ]
        : [],
    },
  } as unknown as Stripe.Subscription
}

describe('resolvePaidTierForSubscription', () => {
  it('maps live Connect and Inner Circle price IDs', () => {
    expect(
      resolvePaidTierForSubscription(
        stubSubscription({ priceId: STRIPE_LIVE_PRICE_IDS.connect })
      )
    ).toBe('connect')
    expect(
      resolvePaidTierForSubscription(
        stubSubscription({ priceId: STRIPE_LIVE_PRICE_IDS.inner_circle })
      )
    ).toBe('inner_circle')
  })

  it('falls back to subscription metadata.product_tier', () => {
    expect(
      resolvePaidTierForSubscription(
        stubSubscription({
          priceId: 'price_unknown_live',
          productTier: 'elite_circle',
        })
      )
    ).toBe('elite_circle')
  })

  it('falls back to checkout session product_tier', () => {
    expect(
      resolvePaidTierForSubscription(
        stubSubscription({ priceId: 'price_unknown_live' }),
        'inner_circle'
      )
    ).toBe('inner_circle')
  })

  it('returns null when no price or metadata mapping exists', () => {
    expect(
      resolvePaidTierForSubscription(
        stubSubscription({ priceId: 'price_unknown_live' })
      )
    ).toBeNull()
  })
})
