import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
  entitlementCycleActionForStripePrice,
  grantsForBenefitPackage,
  type CircleBenefitPackageId,
} from '@/lib/circle-benefit-packages'
import { startEntitlementCycle } from '@/lib/membership-billing-cycles'
import type { EntitlementCycle } from '@/lib/membership-entitlements'

export {
  checkoutPaymentSettlesMembership,
  entitlementOpenForInvoiceBillingReason,
} from '@/lib/stripe/membership-fulfillment-gates'

export class UnmappedMembershipPriceError extends Error {
  readonly code = 'unmapped_membership_price'

  constructor(priceId: string | null | undefined) {
    super(
      priceId
        ? `Unmapped Stripe price ${priceId} requires manual attention before membership fulfillment.`
        : 'Missing Stripe price requires manual attention before membership fulfillment.'
    )
    this.name = 'UnmappedMembershipPriceError'
  }
}

export type CircleCycleOpenResult =
  | {
      opened: true
      packageId: CircleBenefitPackageId
      cycle: EntitlementCycle
    }
  | {
      opened: false
      reason: 'missing_price' | 'not_circle'
    }

/**
 * Open the benefit package mapped to a validated Stripe price.
 * An unmapped price throws. It does not guess a package from the tier name.
 */
export async function openCircleCycleForStripePrice(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string
    priceId: string | null | undefined
    periodStart: Date
    periodEnd: Date
    additionalPrices?: Readonly<Record<string, CircleBenefitPackageId>>
  }
): Promise<CircleCycleOpenResult> {
  const action = entitlementCycleActionForStripePrice(
    input.priceId,
    input.additionalPrices
  )
  if (action.action === 'skip') {
    if (action.reason === 'unmapped_price') {
      console.error(
        '[stripe_sync] unmapped Stripe price; entitlement cycle not started',
        { userId: input.userId, priceId: input.priceId ?? null }
      )
      throw new UnmappedMembershipPriceError(input.priceId)
    }
    return { opened: false, reason: action.reason }
  }

  const grant = grantsForBenefitPackage(action.packageId)
  const cycle = await startEntitlementCycle(supabase, {
    userId: input.userId,
    productTier: grant.tier,
    benefitPackage: action.packageId,
    plan: 'monthly',
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
  })
  return { opened: true, packageId: action.packageId, cycle }
}
