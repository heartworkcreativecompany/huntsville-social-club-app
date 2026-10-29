import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NEW_PURCHASE_STRIPE_PRICE_IDS } from '@/lib/circle-benefit-packages'
import { PRICING_PLANS } from '@/lib/membership-pricing-copy'

const { stripeState, viewerState } = vi.hoisted(() => ({
  stripeState: {
    configured: true,
    create: vi.fn(),
  },
  viewerState: {
    viewer: {
      userId: '11111111-1111-4111-8111-111111111111',
      email: 'member@example.test',
      canAccessApp: true,
      profile: { membership_billing: null },
    } as null | {
      userId: string
      email: string
      canAccessApp: boolean
      profile: { membership_billing: null }
    },
  },
}))

vi.mock('next/headers', () => ({
  headers: async () => ({
    get: () => null,
  }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: vi.fn() }),
}))

vi.mock('@/lib/viewer', () => ({
  getViewer: async () => viewerState.viewer,
}))

vi.mock('@/lib/stripe/customer', () => ({
  getOrCreateStripeCustomer: async () => 'cus_test_member',
}))

vi.mock('@/lib/stripe/config', async () => {
  const actual = await vi.importActual<typeof import('@/lib/stripe/config')>(
    '@/lib/stripe/config'
  )
  return {
    ...actual,
    getStripe: () => ({
      checkout: {
        sessions: {
          create: (...args: unknown[]) => stripeState.create(...args),
        },
      },
    }),
    isStripeConfigured: () => stripeState.configured,
    appBaseUrl: () => 'http://127.0.0.1:3010',
  }
})

import { createMembershipCheckoutSession } from '@/app/(club)/membership/actions'

const savedEnv = {
  inner: process.env.STRIPE_PRICE_ID_INNER_CIRCLE,
  elite: process.env.STRIPE_PRICE_ID_ELITE_CIRCLE,
  connect: process.env.STRIPE_PRICE_ID_CONNECT,
  vercel: process.env.VERCEL_ENV,
  secret: process.env.STRIPE_SECRET_KEY,
}

describe('retained membership checkout', () => {
  beforeEach(() => {
    stripeState.configured = true
    stripeState.create.mockReset()
    stripeState.create.mockResolvedValue({
      id: 'cs_test_membership',
      url: 'https://checkout.stripe.test/session',
    })
    viewerState.viewer = {
      userId: '11111111-1111-4111-8111-111111111111',
      email: 'member@example.test',
      canAccessApp: true,
      profile: { membership_billing: null },
    }
    delete process.env.STRIPE_PRICE_ID_INNER_CIRCLE
    delete process.env.STRIPE_PRICE_ID_ELITE_CIRCLE
    delete process.env.STRIPE_PRICE_ID_CONNECT
    delete process.env.VERCEL_ENV
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock'
  })

  afterEach(() => {
    restoreEnv('STRIPE_PRICE_ID_INNER_CIRCLE', savedEnv.inner)
    restoreEnv('STRIPE_PRICE_ID_ELITE_CIRCLE', savedEnv.elite)
    restoreEnv('STRIPE_PRICE_ID_CONNECT', savedEnv.connect)
    restoreEnv('VERCEL_ENV', savedEnv.vercel)
    restoreEnv('STRIPE_SECRET_KEY', savedEnv.secret)
  })

  it('creates an Inner Circle session with the approved live price', async () => {
    const result = await createMembershipCheckoutSession('inner_circle')

    expect(result).toEqual({ url: 'https://checkout.stripe.test/session' })
    expect(stripeState.create).toHaveBeenCalledOnce()
    const params = stripeState.create.mock.calls[0][0] as {
      mode: string
      line_items: { price: string; quantity: number }[]
      metadata: { product_tier: string }
    }
    expect(params.mode).toBe('subscription')
    expect(params.line_items).toEqual([
      { price: NEW_PURCHASE_STRIPE_PRICE_IDS.inner_circle, quantity: 1 },
    ])
    expect(params.line_items[0].price).toBe('price_1UVhbLBei7W40myBUHWYhB73')
    expect(PRICING_PLANS.inner_circle.price).toBe('$15.99/month')
    expect(params.metadata.product_tier).toBe('inner_circle')
  })

  it('creates an Elite Circle session with the approved live price', async () => {
    const result = await createMembershipCheckoutSession('elite_circle')

    expect(result).toEqual({ url: 'https://checkout.stripe.test/session' })
    expect(stripeState.create).toHaveBeenCalledOnce()
    const params = stripeState.create.mock.calls[0][0] as {
      mode: string
      line_items: { price: string; quantity: number }[]
      metadata: { product_tier: string }
    }
    expect(params.mode).toBe('subscription')
    expect(params.line_items).toEqual([
      { price: NEW_PURCHASE_STRIPE_PRICE_IDS.elite_circle, quantity: 1 },
    ])
    expect(params.line_items[0].price).toBe('price_1UVhbmBei7W40myBlYFYFFZy')
    expect(PRICING_PLANS.elite_circle.price).toBe('$39.99/month')
    expect(params.metadata.product_tier).toBe('elite_circle')
  })

  it('rejects a new Connect checkout without creating a Stripe session', async () => {
    const result = await createMembershipCheckoutSession('connect')

    expect(result).toEqual({
      error:
        'Connect is no longer available for new purchase. Inner Circle and Elite Circle remain available.',
    })
    expect(stripeState.create).not.toHaveBeenCalled()
  })
})

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
    return
  }
  process.env[name] = value
}
