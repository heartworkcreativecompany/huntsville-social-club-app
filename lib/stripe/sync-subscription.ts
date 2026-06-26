import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
  startEntitlementCycle,
} from '@/lib/membership-billing-cycles'
import {
  parseMembershipBilling,
  type MembershipBilling,
  type SubscriptionStatus,
} from '@/lib/membership-systems'
import { getStripe, tierFromStripePriceId, type PaidMembershipTier } from '@/lib/stripe/config'
import { subscriptionPeriod } from '@/lib/stripe/invoice-helpers'

export function mapStripeSubscriptionStatus(
  status: Stripe.Subscription.Status
): SubscriptionStatus {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'active'
    case 'past_due':
      return 'past_due'
    case 'canceled':
    case 'unpaid':
      return 'cancelled'
    case 'incomplete':
    case 'paused':
      return 'grace'
    case 'incomplete_expired':
      return 'cancelled'
    default:
      return 'none'
  }
}

function subscriptionGrantsPaidAccess(status: Stripe.Subscription.Status): boolean {
  return status === 'active' || status === 'trialing'
}

function primaryPriceId(subscription: Stripe.Subscription): string | null {
  return subscription.items.data[0]?.price?.id ?? null
}

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
}

export async function syncStripeSubscription(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string
    subscription: Stripe.Subscription
    options?: SyncStripeSubscriptionOptions
  }
): Promise<MembershipBilling> {
  const { userId, subscription, options } = input
  const priceId = primaryPriceId(subscription)
  const mappedTier = tierFromStripePriceId(priceId)
  const grantsAccess = subscriptionGrantsPaidAccess(subscription.status)
  const internalStatus = mapStripeSubscriptionStatus(subscription.status)

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
    .select('membership_billing')
    .eq('id', userId)
    .single()

  const existing = parseMembershipBilling(profile?.membership_billing)

  let tier: MembershipBilling['tier'] = existing.tier
  if (grantsAccess && mappedTier) {
    tier = mappedTier
  } else if (
    subscription.status === 'canceled' ||
    subscription.status === 'unpaid' ||
    subscription.status === 'incomplete_expired'
  ) {
    tier = 'member'
  }

  const billing: MembershipBilling = {
    ...existing,
    tier,
    plan: grantsAccess && mappedTier ? 'monthly' : existing.plan,
    subscription_status: internalStatus,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    stripe_price_id: priceId,
    renewal_at: periodEnd.toISOString(),
    billing_period_start: periodStart.toISOString(),
    billing_period_end: periodEnd.toISOString(),
    trial_end: trialEnd?.toISOString() ?? null,
    cancelled_at:
      subscription.status === 'canceled'
        ? new Date().toISOString()
        : grantsAccess
          ? null
          : existing.cancelled_at,
    plan_change_pending: null,
    payment_failure: {
      active: subscription.status === 'past_due',
      since:
        subscription.status === 'past_due'
          ? existing.payment_failure.since ?? new Date().toISOString()
          : null,
      reminder_sent_at: existing.payment_failure.reminder_sent_at,
    },
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      membership_billing: billing,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)

  if (error) {
    throw new Error(error.message)
  }

  if (grantsAccess && mappedTier) {
    if (options?.startEntitlementCycle || options?.renewEntitlementCycle) {
      await startEntitlementCycle(supabase, {
        userId,
        productTier: mappedTier,
        plan: 'monthly',
        periodStart,
        periodEnd,
      })
    }
  }

  return billing
}

export async function downgradeMembershipFromStripe(
  supabase: SupabaseClient<Database>,
  userId: string,
  subscription?: Stripe.Subscription | null
): Promise<void> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('membership_billing')
    .eq('id', userId)
    .single()

  const existing = parseMembershipBilling(profile?.membership_billing)

  const billing: MembershipBilling = {
    ...existing,
    tier: 'member',
    plan: null,
    subscription_status: 'cancelled',
    cancelled_at: new Date().toISOString(),
    stripe_subscription_id: subscription?.id ?? existing.stripe_subscription_id,
    stripe_price_id: null,
    trial_end: null,
    renewal_at: null,
    billing_period_start: null,
    billing_period_end: null,
    payment_failure: {
      active: false,
      since: null,
      reminder_sent_at: null,
    },
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      membership_billing: billing,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)

  if (error) {
    throw new Error(error.message)
  }
}

export function paidTierFromSubscription(
  subscription: Stripe.Subscription
): PaidMembershipTier | null {
  if (!subscriptionGrantsPaidAccess(subscription.status)) return null
  return tierFromStripePriceId(primaryPriceId(subscription))
}
