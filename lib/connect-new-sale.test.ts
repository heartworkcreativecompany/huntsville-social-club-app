import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  isPaidMembershipTier,
  isPurchasableMembershipTier,
  STRIPE_LIVE_PRICE_IDS,
} from '@/lib/stripe/config'
import { paidMembershipPlanFromQuery } from '@/lib/membership-plan-links'
import { PRICING_PLANS, PRICING_SUBHEADLINE } from '@/lib/membership-pricing-copy'

describe('Connect new-sale retirement', () => {
  it('keeps Connect as a recognized existing plan and blocks new purchase selection', () => {
    expect(isPaidMembershipTier('connect')).toBe(true)
    expect(isPurchasableMembershipTier('connect')).toBe(false)
    expect(isPurchasableMembershipTier('inner_circle')).toBe(true)
    expect(isPurchasableMembershipTier('elite_circle')).toBe(true)
    expect(paidMembershipPlanFromQuery('connect')).toBeNull()
    expect(STRIPE_LIVE_PRICE_IDS.connect).toBe('price_1UCjKABei7W40myB2Mnqrtse')
    expect(PRICING_PLANS.inner_circle.price).toBe('$15.99/month')
    expect(PRICING_PLANS.elite_circle.price).toBe('$39.99/month')
    expect(PRICING_SUBHEADLINE).not.toMatch(/add messaging with Connect/i)
  })

  it('denies Connect checkout before a Stripe session is created', () => {
    const actions = readFileSync('app/(club)/membership/actions.ts', 'utf8')
    const start = actions.indexOf('export async function createMembershipCheckoutSession')
    const body = actions.slice(start, actions.indexOf('export async function createBillingPortalSession'))
    const denied = body.indexOf("tierInput === 'connect'")
    const stripeGate = body.indexOf('isStripeConfigured()')
    expect(denied).toBeGreaterThan(-1)
    expect(denied).toBeLessThan(stripeGate)
    expect(body).toContain('CONNECT_NEW_SALE_RETIRED_MESSAGE')
    expect(actions).toContain('createBillingPortalSession')
  })
})
