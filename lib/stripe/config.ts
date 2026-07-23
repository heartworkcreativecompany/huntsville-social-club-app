import Stripe from 'stripe'
import { appOrigin } from '@/lib/site'

let stripeClient: Stripe | null = null

export function getStripe(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not configured.')
  }

  if (!stripeClient) {
    stripeClient = new Stripe(secretKey)
  }

  return stripeClient
}

export function isStripeConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_PRICE_ID_INNER_CIRCLE &&
      process.env.STRIPE_PRICE_ID_ELITE_CIRCLE
  )
}

/** Stripe Identity needs the secret key plus a public app origin for return_url. */
export function isStripeIdentityConfigured(): boolean {
  if (!process.env.STRIPE_SECRET_KEY?.trim()) return false
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

export function stripePriceIdForTier(tier: PaidMembershipTier): string {
  const priceId =
    tier === 'inner_circle'
      ? process.env.STRIPE_PRICE_ID_INNER_CIRCLE
      : process.env.STRIPE_PRICE_ID_ELITE_CIRCLE

  if (!priceId) {
    throw new Error(
      `Stripe price ID is not configured for ${tier}. Set STRIPE_PRICE_ID_${tier === 'inner_circle' ? 'INNER_CIRCLE' : 'ELITE_CIRCLE'}.`
    )
  }

  return priceId
}

export function tierFromStripePriceId(
  priceId: string | null | undefined
): PaidMembershipTier | null {
  if (!priceId) return null
  if (priceId === process.env.STRIPE_PRICE_ID_INNER_CIRCLE) return 'inner_circle'
  if (priceId === process.env.STRIPE_PRICE_ID_ELITE_CIRCLE) return 'elite_circle'
  return null
}

export function optionalCheckoutTrialDays(): number | undefined {
  const raw = process.env.STRIPE_CHECKOUT_TRIAL_DAYS
  if (!raw?.trim()) return undefined
  const days = Number.parseInt(raw, 10)
  if (!Number.isFinite(days) || days <= 0) return undefined
  return days
}

/** Stripe Price ID for $199 event sponsorship (one-time). Optional — falls back to price_data. */
export function stripeSponsorshipPriceId(): string | null {
  const id = process.env.STRIPE_PRICE_ID_EVENT_SPONSORSHIP?.trim()
  return id || null
}

/** Public origin for Stripe Checkout / Identity return URLs (same rules as lib/site). */
export function appBaseUrl(): string {
  return appOrigin()
}
