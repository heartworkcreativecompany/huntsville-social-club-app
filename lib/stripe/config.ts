import Stripe from 'stripe'
import { appOrigin } from '@/lib/site'

let stripeClient: Stripe | null = null

/**
 * Live-mode Stripe Price IDs from the production Stripe account.
 * Canonical membership / sponsorship mappings — checkout must not depend on
 * STRIPE_PRICE_ID_* env vars being present in production.
 */
export const STRIPE_LIVE_PRICE_IDS = {
  /** Inner Circle — $29.99/month (prod_UqPcL4boAOiMZT) */
  inner_circle: 'price_1TqimnBei7W40myBUKESC7wF',
  /** Elite Circle — $69.99/month (prod_UqPciS4ul6FhvF) */
  elite_circle: 'price_1TqimyBei7W40myBRnke6fQF',
  /** Event Sponsorship — $499 one-time (prod_UvwN6jDxbT9O28) */
  event_sponsorship: 'price_1Tw4UjBei7W40myBOG1mkxQ5',
} as const

/** Member is free — no Stripe product/price. */
export const STRIPE_LIVE_PRODUCT_IDS = {
  inner_circle: 'prod_UqPcL4boAOiMZT',
  elite_circle: 'prod_UqPciS4ul6FhvF',
  event_sponsorship: 'prod_UvwN6jDxbT9O28',
} as const

/** Bracket access avoids any accidental build-time env inlining issues. */
function readEnv(name: string): string | undefined {
  const value = process.env[name]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function isDeployedProduction(): boolean {
  // Prefer the host signal so local `next start` (NODE_ENV=production) can still
  // use test keys when developing against Stripe test mode.
  return readEnv('VERCEL_ENV') === 'production'
}

function stripeSecretKey(): string {
  const secretKey = readEnv('STRIPE_SECRET_KEY')
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not configured.')
  }

  if (isDeployedProduction() && secretKey.startsWith('sk_test_')) {
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

/**
 * Checkout / portal gate. Requires only a Stripe secret key.
 * Price IDs come from STRIPE_LIVE_PRICE_IDS (env overrides are optional for local test).
 *
 * Does NOT require:
 * - NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
 * - STRIPE_WEBHOOK_SECRET
 * - STRIPE_PRICE_ID_INNER_CIRCLE
 * - STRIPE_PRICE_ID_ELITE_CIRCLE
 */
export function isStripeConfigured(): boolean {
  return Boolean(readEnv('STRIPE_SECRET_KEY'))
}

/** Stripe Identity needs the secret key plus a public app origin for return_url. */
export function isStripeIdentityConfigured(): boolean {
  if (!readEnv('STRIPE_SECRET_KEY')) return false
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
  return tier === 'inner_circle'
    ? readEnv('STRIPE_PRICE_ID_INNER_CIRCLE')
    : readEnv('STRIPE_PRICE_ID_ELITE_CIRCLE')
}

export function stripePriceIdForTier(tier: PaidMembershipTier): string {
  // Deployed production always uses live Stripe prices.
  if (isDeployedProduction()) {
    return STRIPE_LIVE_PRICE_IDS[tier]
  }

  // Local / preview: allow test-mode price overrides; otherwise use live IDs.
  const fromEnv = envPriceIdForTier(tier)
  if (fromEnv?.startsWith('price_')) {
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
      readEnv('STRIPE_PRICE_ID_INNER_CIRCLE'),
    ].filter(Boolean) as string[]
  )
  const eliteCandidates = new Set(
    [
      STRIPE_LIVE_PRICE_IDS.elite_circle,
      readEnv('STRIPE_PRICE_ID_ELITE_CIRCLE'),
    ].filter(Boolean) as string[]
  )

  if (innerCandidates.has(priceId)) return 'inner_circle'
  if (eliteCandidates.has(priceId)) return 'elite_circle'
  return null
}

export function optionalCheckoutTrialDays(): number | undefined {
  const raw = readEnv('STRIPE_CHECKOUT_TRIAL_DAYS')
  if (!raw) return undefined
  const days = Number.parseInt(raw, 10)
  if (!Number.isFinite(days) || days <= 0) return undefined
  return days
}

/** Stripe Price ID for $499 event sponsorship (one-time). Always resolvable. */
export function stripeSponsorshipPriceId(): string | null {
  if (isDeployedProduction()) {
    return STRIPE_LIVE_PRICE_IDS.event_sponsorship
  }

  const fromEnv = readEnv('STRIPE_PRICE_ID_EVENT_SPONSORSHIP')
  if (fromEnv?.startsWith('price_')) return fromEnv
  return STRIPE_LIVE_PRICE_IDS.event_sponsorship
}

/** Public origin for Stripe Checkout / Identity return URLs (same rules as lib/site). */
export function appBaseUrl(): string {
  return appOrigin()
}
