import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
  parseMembershipBilling,
  type MembershipBilling,
} from '@/lib/membership-systems'
import { openCircleCycleForStripePrice } from '@/lib/stripe/circle-fulfillment'
import {
  buildSyncedMembershipBilling,
  rememberedPaidTier,
  shouldApplyStripeBillingEvent,
  subscriptionGrantsPaidAccess,
} from '@/lib/stripe/membership-billing-sync'

export {
  buildSyncedMembershipBilling,
  mapStripeSubscriptionStatus,
  shouldApplyStripeBillingEvent,
} from '@/lib/stripe/membership-billing-sync'
import { getStripe, type PaidMembershipTier } from '@/lib/stripe/config'
import {
  primarySubscriptionPriceId,
  resolvePaidTierForSubscription,
} from '@/lib/stripe/resolve-paid-tier'
import type { Json } from '@/lib/database.types'
import { subscriptionPeriod } from '@/lib/stripe/invoice-helpers'
import { runCompatibilitySubscriptionLifecycle } from '@/lib/compatibility/subscription-sync-hook'

export { resolvePaidTierForSubscription } from '@/lib/stripe/resolve-paid-tier'

export function resolveUserIdFromStripeMetadata(
  metadata: Stripe.Metadata | null | undefined
): string | null {
  const userId = metadata?.user_id
  return typeof userId === 'string' && userId.length > 0 ? userId : null
}

export async function resolveUserIdForSubscription(
  subscription: Stripe.Subscription
): Promise<string | null> {
  const fromSubscription = resolveUserIdFromStripeMetadata(subscription.metadata)
  if (fromSubscription) return fromSubscription

  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id

  if (!customerId) return null

  const stripe = getStripe()
  const customer = await stripe.customers.retrieve(customerId)
  if (customer.deleted) return null

  return resolveUserIdFromStripeMetadata(customer.metadata)
}

export type SyncStripeSubscriptionOptions = {
  startEntitlementCycle?: boolean
  renewEntitlementCycle?: boolean
  /** Stripe Event.created (unix seconds). Older events must not overwrite newer billing. */
  eventCreated?: number
}

async function persistMembershipBilling(
  supabase: SupabaseClient<Database>,
  userId: string,
  existing: MembershipBilling,
  billing: MembershipBilling
): Promise<MembershipBilling> {
  const eventCreated = billing.stripe_event_created
  if (
    eventCreated == null ||
    !shouldApplyStripeBillingEvent({
      existingEventCreated: existing.stripe_event_created,
      incomingEventCreated: eventCreated,
      existingStatus: existing.subscription_status,
      incomingStatus: billing.subscription_status,
    })
  ) {
    return existing
  }

  const { data, error } = await supabase.rpc('apply_membership_billing_sync', {
    p_user_id: userId,
    p_billing: billing as unknown as Json,
    p_event_created: eventCreated,
  })

  if (!error) {
    return parseMembershipBilling(data)
  }

  const missingFunction =
    error.code === 'PGRST202' ||
    error.message.includes('apply_membership_billing_sync')
  if (!missingFunction) {
    throw new Error(error.message)
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      membership_billing: billing as unknown as Json,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)

  if (updateError) {
    throw new Error(updateError.message)
  }

  return billing
}

export async function syncStripeSubscription(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string
    subscription: Stripe.Subscription
    options?: SyncStripeSubscriptionOptions
    /** Checkout session metadata.product_tier when price ID mapping is unavailable. */
    productTierFallback?: string | null
  }
): Promise<MembershipBilling> {
  const { userId, subscription, options, productTierFallback } = input
  const priceId = primarySubscriptionPriceId(subscription)
  const mappedTier = resolvePaidTierForSubscription(
    subscription,
    productTierFallback
  )
  const grantsAccess = subscriptionGrantsPaidAccess(subscription.status)

  if (grantsAccess && !mappedTier) {
    console.error('[stripe_sync] active subscription missing mapped paid tier', {
      userId,
      priceId,
      subscriptionId: subscription.id,
      subscriptionMetaTier: subscription.metadata?.product_tier ?? null,
      productTierFallback: productTierFallback ?? null,
    })
  }

  const { periodStart, periodEnd } = subscriptionPeriod(subscription)
  const trialEnd = subscription.trial_end
    ? new Date(subscription.trial_end * 1000)
    : null

  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id

  const { data: profile } = await supabase
    .from('profiles')
    .select('membership_billing, role')
    .eq('id', userId)
    .single()

  const existing = parseMembershipBilling(profile?.membership_billing)
  const previousBilling = { ...existing }
  const eventCreated =
    options?.eventCreated ?? Math.floor(Date.now() / 1000)
  const billing = buildSyncedMembershipBilling({
    existing,
    subscriptionStatus: subscription.status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
    mappedTier,
    priceId,
    periodStart,
    periodEnd,
    customerId,
    subscriptionId: subscription.id,
    trialEnd,
    eventCreated,
  })

  const saved = await persistMembershipBilling(
    supabase,
    userId,
    existing,
    billing
  )
  if (saved.stripe_event_created !== billing.stripe_event_created) {
    return saved
  }

  const accessEnded = saved.subscription_status === 'cancelled'
  const shouldOpenCycle =
    !accessEnded &&
    grantsAccess &&
    (options?.startEntitlementCycle || options?.renewEntitlementCycle)
  if (shouldOpenCycle) {
    await openCircleCycleForStripePrice(supabase, {
      userId,
      priceId,
      periodStart,
      periodEnd,
    })
  }

  await runCompatibilitySubscriptionLifecycle(supabase, {
    userId,
    previousBilling,
    nextBilling: saved,
    role: profile?.role,
  })

  return saved
}

export async function downgradeMembershipFromStripe(
  supabase: SupabaseClient<Database>,
  userId: string,
  subscription?: Stripe.Subscription | null
): Promise<void> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('membership_billing, role')
    .eq('id', userId)
    .single()

  const existing = parseMembershipBilling(profile?.membership_billing)
  const previousBilling = { ...existing }

  const now = new Date()
  const billing: MembershipBilling = {
    ...existing,
    tier: 'member',
    plan: null,
    subscription_status: 'cancelled',
    cancelled_at: existing.cancelled_at ?? now.toISOString(),
    stripe_subscription_id: subscription?.id ?? existing.stripe_subscription_id,
    stripe_price_id: null,
    trial_end: null,
    renewal_at: null,
    cancel_at_period_end: false,
    ended_paid_tier: rememberedPaidTier(existing, null),
    stripe_event_created:
      existing.stripe_event_created != null
        ? existing.stripe_event_created + 1
        : Math.floor(now.getTime() / 1000),
    payment_failure: {
      active: false,
      since: null,
      reminder_sent_at: null,
    },
  }

  const saved = await persistMembershipBilling(supabase, userId, existing, billing)
  if (saved.stripe_event_created !== billing.stripe_event_created) {
    return
  }

  await runCompatibilitySubscriptionLifecycle(supabase, {
    userId,
    previousBilling,
    nextBilling: saved,
    role: profile?.role,
  })
}

export function paidTierFromSubscription(
  subscription: Stripe.Subscription
): PaidMembershipTier | null {
  if (!subscriptionGrantsPaidAccess(subscription.status)) return null
  return resolvePaidTierForSubscription(subscription)
}
