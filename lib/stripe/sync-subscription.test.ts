import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type Stripe from 'stripe'
import {
  primarySubscriptionPriceId,
  resolvePaidTierForSubscription,
} from '@/lib/stripe/resolve-paid-tier'
import { STRIPE_LIVE_PRICE_IDS } from '@/lib/stripe/config'

const repoRoot = join(__dirname, '../..')

function stubSubscription(input: {
  priceId?: string | null
  productTier?: string
  priceAs?: 'object' | 'string' | 'plan'
}): Stripe.Subscription {
  const priceAs = input.priceAs ?? 'object'
  const item =
    input.priceId == null
      ? null
      : priceAs === 'string'
        ? {
            id: 'si_test',
            object: 'subscription_item',
            price: input.priceId,
          }
        : priceAs === 'plan'
          ? {
              id: 'si_test',
              object: 'subscription_item',
              price: null,
              plan: { id: input.priceId },
            }
          : {
              id: 'si_test',
              object: 'subscription_item',
              price: { id: input.priceId, object: 'price' },
            }

  return {
    id: 'sub_test',
    object: 'subscription',
    status: 'active',
    metadata: input.productTier
      ? { product_tier: input.productTier, user_id: 'user_1' }
      : { user_id: 'user_1' },
    items: {
      object: 'list',
      data: item ? [item] : [],
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
    expect(STRIPE_LIVE_PRICE_IDS.connect).toBe('price_1UCjKABei7W40myB2Mnqrtse')
    expect(
      resolvePaidTierForSubscription(
        stubSubscription({ priceId: STRIPE_LIVE_PRICE_IDS.inner_circle })
      )
    ).toBe('inner_circle')
  })

  it('maps an unexpanded Connect price ID string from webhook payloads', () => {
    const subscription = stubSubscription({
      priceId: STRIPE_LIVE_PRICE_IDS.connect,
      priceAs: 'string',
    })
    expect(primarySubscriptionPriceId(subscription)).toBe(
      STRIPE_LIVE_PRICE_IDS.connect
    )
    expect(resolvePaidTierForSubscription(subscription)).toBe('connect')
  })

  it('maps a legacy plan.id Connect price', () => {
    expect(
      resolvePaidTierForSubscription(
        stubSubscription({
          priceId: STRIPE_LIVE_PRICE_IDS.connect,
          priceAs: 'plan',
        })
      )
    ).toBe('connect')
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
    expect(
      resolvePaidTierForSubscription(
        stubSubscription({ priceId: 'price_unknown_live', priceAs: 'string' })
      )
    ).toBeNull()
  })
})

describe('Stripe subscription webhook mapping path', () => {
  it('retrieves the Stripe subscription on created/updated before sync', () => {
    const route = readFileSync(
      join(repoRoot, 'app/api/stripe/webhook/route.ts'),
      'utf8'
    )
    expect(route).toContain("case 'customer.subscription.created'")
    expect(route).toContain("case 'customer.subscription.updated'")
    expect(route).toContain('stripe.subscriptions.retrieve(incoming.id)')
    expect(route).toContain('productTierFallback')
  })
})
