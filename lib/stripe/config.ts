import Stripe from 'stripe'
import { appOrigin } from '@/lib/site'

let stripeClient: Stripe | null = null

/**
 * Live-mode Stripe Price IDs from the production Stripe account.
 * These are the canonical membership / sponsorship mappings.
 * Env vars may override for local test-mode development only.
 */
export const STRIPE_LIVE_PRICE_IDS = {
  /** Inner Circle — $29.99/month (prod_UqPcL4boAOiMZT) */
  inner_circle: 'price_1TqimnBei7W40myBUKESC7wF',
  /** Elite Circle — $69.99/month (prod_UqPciS4ul6FhvF) */
  elite_circle: 'price_1TqimyBei7W40myBRnke6fQF',
  /** Event Sponsorship — $199 one-time (prod_UvwN6jDxbT9O28) */
  event_sponsorship: 'price_1Tw4UjBei7W40myBOG1mkxQ5',
} as const

/** Member is free — no Stripe product/price. */
export const STRIPE_LIVE_PRODUCT_IDS = {
  inner_circle: 'prod_UqPcL4boAOiMZT',
  elite_circle: 'prod_UqPciS4ul6FhvF',
  event_sponsorship: 'prod_UvwN6jDxbT9O28',
} as const

function isProductionRuntime(): boolean {
  return (
    process.env.VERCEL_ENV === 'production' ||
    process.env.NODE_ENV === 'production'
  )
}

function stripeSecretKey(): string {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim()
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not configured.')
  }

  if (isProductionRuntime() && secretKey.startsWith('sk_test_')) {
    throw new Error(
      'Production must use a live Stripe secret key (sk_live_…), not a test key.'
    )
  }

  return secretKey
}

export function getStripe(): Stripe {
  const secretKey = stripeSecretKey()

  if (!stripeClient) {
    stripeClient = new Stripe(secretKey)
  }

  return stripeClient
}

export function isStripeConfigured(): boolean {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim()
  if (!secretKey) return false
  if (isProductionRuntime() && secretKey.startsWith('sk_test_')) return false
  // Live price IDs are baked in; local test mode may override via env.
  return true
}

/** Stripe Identity needs the secret key plus a public app origin for return_url. */
export function isStripeIdentityConfigured(): boolean {
  if (!process.env.STRIPE_SECRET_KEY?.trim()) return false
  if (isProductionRuntime() && process.env.STRIPE_SECRET_KEY.startsWith('sk_test_')) {
    return false
  }
  try {
    appOrigin()
    return true
  } catch {
    return false
  }
}

export type PaidMembershipTier = 'inner_circle' | 'elite_circle'

const PAID_TIERS: PaidMembershipTier[] = ['inner_circle', 'elite_circle']

export function isPaidMembershipTier(value: string): value is PaidMembershipTier {
  return PAID_TIERS.includes(value as PaidMembershipTier)
}

function envPriceIdForTier(tier: PaidMembershipTier): string | undefined {
  const raw =
    tier === 'inner_circle'
      ? process.env.STRIPE_PRICE_ID_INNER_CIRCLE
      : process.env.STRIPE_PRICE_ID_ELITE_CIRCLE
  const trimmed = raw?.trim()
  return trimmed || undefined
}

export function stripePriceIdForTier(tier: PaidMembershipTier): string {
  // Production always uses live Stripe prices — never sandbox/test price IDs.
  if (isProductionRuntime()) {
    return STRIPE_LIVE_PRICE_IDS[tier]
  }

  const fromEnv = envPriceIdForTier(tier)
  if (fromEnv) {
    if (fromEnv.startsWith('price_') === false) {
      throw new Error(
        `Stripe price ID is invalid for ${tier}. Expected a price_… ID.`
      )
    }
    return fromEnv
  }

  return STRIPE_LIVE_PRICE_IDS[tier]
}

export function tierFromStripePriceId(
  priceId: string | null | undefined
): PaidMembershipTier | null {
  if (!priceId) return null

  const innerCandidates = new Set(
    [
      STRIPE_LIVE_PRICE_IDS.inner_circle,
      process.env.STRIPE_PRICE_ID_INNER_CIRCLE?.trim(),
    ].filter(Boolean) as string[]
  )
  const eliteCandidates = new Set(
    [
      STRIPE_LIVE_PRICE_IDS.elite_circle,
      process.env.STRIPE_PRICE_ID_ELITE_CIRCLE?.trim(),
    ].filter(Boolean) as string[]
  )

  if (innerCandidates.has(priceId)) return 'inner_circle'
  if (eliteCandidates.has(priceId)) return 'elite_circle'
  return null
}

export function optionalCheckoutTrialDays(): number | undefined {
  const raw = process.env.STRIPE_CHECKOUT_TRIAL_DAYS
  if (!raw?.trim()) return undefined
  const days = Number.parseInt(raw, 10)
  if (!Number.isFinite(days) || days <= 0) return undefined
  return days
}

/** Stripe Price ID for $199 event sponsorship (one-time). */
export function stripeSponsorshipPriceId(): string | null {
  if (isProductionRuntime()) {
    return STRIPE_LIVE_PRICE_IDS.event_sponsorship
  }

  const fromEnv = process.env.STRIPE_PRICE_ID_EVENT_SPONSORSHIP?.trim()
  if (fromEnv) return fromEnv
  return STRIPE_LIVE_PRICE_IDS.event_sponsorship
}

/** Public origin for Stripe Checkout / Identity return URLs (same rules as lib/site). */
export function appBaseUrl(): string {
  return appOrigin()
}
