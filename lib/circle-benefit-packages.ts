/**
 * Circle tier identity (Inner vs Elite) is separate from the benefit package
 * issued for a billing cycle. Packages are resolved from a validated Stripe
 * price ID. An unknown price never falls back to a tier name.
 *
 * These live IDs match lib/stripe/config.ts. They are copied here so package
 * resolution does not import the Stripe client module. Tests lock them to
 * STRIPE_LIVE_PRICE_IDS and STRIPE_LIVE_PRODUCT_IDS.
 */
const LIVE_CONNECT_PRICE_ID = 'price_1UCjKABei7W40myB2Mnqrtse'
const LIVE_INNER_PRICE_ID = 'price_1TqimnBei7W40myBUKESC7wF'
const LIVE_ELITE_PRICE_ID = 'price_1TqimyBei7W40myBRnke6fQF'
const LIVE_INNER_PRODUCT_ID = 'prod_UqPcL4boAOiMZT'
const LIVE_ELITE_PRODUCT_ID = 'prod_UqPciS4ul6FhvF'

export const CIRCLE_BENEFIT_PACKAGE_IDS = [
  'inner_legacy',
  'elite_legacy',
  'inner_new',
  'elite_new',
] as const

export type CircleBenefitPackageId = (typeof CIRCLE_BENEFIT_PACKAGE_IDS)[number]

export type CircleBenefitGrant = {
  id: CircleBenefitPackageId
  tier: 'inner_circle' | 'elite_circle'
  /** Premium-event credits. Stored on the cycle; null is not used for new writes. */
  premiumCredits: number
  /**
   * Circle Social credits written onto a new cycle.
   * Null means unlimited for that cycle (legacy Elite, and historical Inner
   * cycles that were already open when metering began).
   */
  circleSocialCredits: number | null
  guestInvites: number
  priorityRsvp: boolean
  businessDirectoryApplication: boolean
  /** Existing subscribers stay on this package until a separate transition. */
  generation: 'legacy' | 'new_purchase'
}

export const CIRCLE_BENEFIT_PACKAGES: Record<
  CircleBenefitPackageId,
  CircleBenefitGrant
> = {
  inner_legacy: {
    id: 'inner_legacy',
    tier: 'inner_circle',
    premiumCredits: 1,
    circleSocialCredits: 2,
    guestInvites: 0,
    priorityRsvp: false,
    businessDirectoryApplication: false,
    generation: 'legacy',
  },
  elite_legacy: {
    id: 'elite_legacy',
    tier: 'elite_circle',
    premiumCredits: 2,
    circleSocialCredits: null,
    guestInvites: 1,
    priorityRsvp: true,
    businessDirectoryApplication: true,
    generation: 'legacy',
  },
  inner_new: {
    id: 'inner_new',
    tier: 'inner_circle',
    premiumCredits: 0,
    circleSocialCredits: 0,
    guestInvites: 0,
    priorityRsvp: false,
    businessDirectoryApplication: false,
    generation: 'new_purchase',
  },
  elite_new: {
    id: 'elite_new',
    tier: 'elite_circle',
    premiumCredits: 1,
    circleSocialCredits: 2,
    guestInvites: 0,
    priorityRsvp: true,
    businessDirectoryApplication: true,
    generation: 'new_purchase',
  },
}

/** Live prices that already bill existing subscribers. */
export const LEGACY_STRIPE_PRICE_PACKAGES = {
  [LIVE_INNER_PRICE_ID]: 'inner_legacy',
  [LIVE_ELITE_PRICE_ID]: 'elite_legacy',
} as const satisfies Record<string, CircleBenefitPackageId>

/**
 * Live new-purchase prices. Legacy prices above stay mapped to the legacy
 * packages for existing subscribers. Checkout uses these IDs only while
 * NEW_PURCHASE_OFFERS_ACTIVE is true.
 */
export const NEW_PURCHASE_STRIPE_PRICE_IDS: {
  inner_circle: string | null
  elite_circle: string | null
} = {
  inner_circle: 'price_1UVhbLBei7W40myBUHWYhB73',
  elite_circle: 'price_1UVhbmBei7W40myBlYFYFFZy',
}

export const NEW_PURCHASE_OFFERS_ACTIVE = true

/** Parameters for a future Stripe price create. Not sent to Stripe. */
export const PROPOSED_NEW_PURCHASE_PRICE_PARAMS = {
  inner_circle: {
    product: LIVE_INNER_PRODUCT_ID,
    currency: 'usd',
    unit_amount: 1599,
    recurring: { interval: 'month' as const },
    nickname: 'Inner Circle monthly new membership',
    metadata: { benefit_package: 'inner_new' },
  },
  elite_circle: {
    product: LIVE_ELITE_PRODUCT_ID,
    currency: 'usd',
    unit_amount: 3999,
    recurring: { interval: 'month' as const },
    nickname: 'Elite Circle monthly new membership',
    metadata: { benefit_package: 'elite_new' },
  },
} as const

/**
 * Checkout price while new offers are inactive stays on the legacy price.
 * When offers are active, the mapped new price is required. A null ID throws
 * instead of charging the legacy price under the new offer.
 */
export function activeCheckoutPriceIdForTier(
  tier: 'connect' | 'inner_circle' | 'elite_circle',
  legacyPriceId: string
): string {
  if (tier === 'connect' || !NEW_PURCHASE_OFFERS_ACTIVE) return legacyPriceId
  const next = NEW_PURCHASE_STRIPE_PRICE_IDS[tier]
  if (!next) {
    throw new Error(
      'New Circle checkout is enabled without a mapped Stripe price ID.'
    )
  }
  return next
}

export function isCircleBenefitPackageId(
  value: string
): value is CircleBenefitPackageId {
  return (CIRCLE_BENEFIT_PACKAGE_IDS as readonly string[]).includes(value)
}

export function grantsForBenefitPackage(
  packageId: CircleBenefitPackageId
): CircleBenefitGrant {
  return CIRCLE_BENEFIT_PACKAGES[packageId]
}

/** Complimentary access and other non-Stripe Circle grants keep legacy rules. */
export function legacyBenefitPackageForTier(
  tier: 'inner_circle' | 'elite_circle'
): CircleBenefitPackageId {
  return tier === 'inner_circle' ? 'inner_legacy' : 'elite_legacy'
}

export function circleBenefitPackageFromPriceId(
  priceId: string | null | undefined,
  additionalPrices?: Readonly<Record<string, CircleBenefitPackageId>>
): CircleBenefitPackageId | null {
  if (!priceId) return null

  const legacy =
    LEGACY_STRIPE_PRICE_PACKAGES[
      priceId as keyof typeof LEGACY_STRIPE_PRICE_PACKAGES
    ]
  if (legacy) return legacy

  if (
    NEW_PURCHASE_STRIPE_PRICE_IDS.inner_circle &&
    priceId === NEW_PURCHASE_STRIPE_PRICE_IDS.inner_circle
  ) {
    return 'inner_new'
  }
  if (
    NEW_PURCHASE_STRIPE_PRICE_IDS.elite_circle &&
    priceId === NEW_PURCHASE_STRIPE_PRICE_IDS.elite_circle
  ) {
    return 'elite_new'
  }

  const additional = additionalPrices?.[priceId]
  if (additional && isCircleBenefitPackageId(additional)) return additional
  return null
}

export type EntitlementCyclePriceAction =
  | { action: 'start'; packageId: CircleBenefitPackageId }
  | { action: 'skip'; reason: 'missing_price' | 'not_circle' | 'unmapped_price' }

/**
 * Decide whether a Stripe subscription price may open a credit cycle.
 * Connect is recognized and skipped. Any other unmapped price is skipped
 * instead of guessing Inner or Elite grants from the tier name.
 */
export function entitlementCycleActionForStripePrice(
  priceId: string | null | undefined,
  additionalPrices?: Readonly<Record<string, CircleBenefitPackageId>>
): EntitlementCyclePriceAction {
  if (!priceId) return { action: 'skip', reason: 'missing_price' }
  if (priceId === LIVE_CONNECT_PRICE_ID) {
    return { action: 'skip', reason: 'not_circle' }
  }
  const packageId = circleBenefitPackageFromPriceId(priceId, additionalPrices)
  if (!packageId) return { action: 'skip', reason: 'unmapped_price' }
  return { action: 'start', packageId }
}
