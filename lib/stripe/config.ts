import Stripe from 'stripe'

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

export function appBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
  if (configured) return configured
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }
  return 'http://localhost:3000'
}
