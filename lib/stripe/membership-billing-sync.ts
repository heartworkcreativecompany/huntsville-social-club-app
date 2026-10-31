import type Stripe from 'stripe'
import type {
  MembershipBilling,
  SubscriptionStatus,
} from '@/lib/membership-systems'
import type { PaidMembershipTier } from '@/lib/stripe/config'

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
    // Not payment recovery. past_due is that state and does not grant access.
    // incomplete/paused keep a previously stored paid tier as grace for other
    // club tools. Grace does not grant messaging. No application deadline ends
    // grace; a later Stripe status (including incomplete_expired) or an admin
    // status change does.
    case 'incomplete':
    case 'paused':
      return 'grace'
    case 'incomplete_expired':
      return 'cancelled'
    default:
      return 'none'
  }
}

export function subscriptionGrantsPaidAccess(
  status: Stripe.Subscription.Status
): boolean {
  return status === 'active' || status === 'trialing'
}

export function shouldApplyStripeBillingEvent(input: {
  existingEventCreated: number | null
  incomingEventCreated: number
  existingStatus: MembershipBilling['subscription_status']
  incomingStatus: MembershipBilling['subscription_status']
}): boolean {
  if (
    input.existingEventCreated != null &&
    input.incomingEventCreated < input.existingEventCreated
  ) {
    return false
  }
  if (
    input.existingEventCreated != null &&
    input.incomingEventCreated === input.existingEventCreated &&
    input.existingStatus === 'cancelled' &&
    input.incomingStatus !== 'cancelled'
  ) {
    return false
  }
  return true
}

export function rememberedPaidTier(
  existing: MembershipBilling,
  mappedTier: PaidMembershipTier | null
): MembershipBilling['ended_paid_tier'] {
  if (mappedTier) return mappedTier
  if (
    existing.tier === 'connect' ||
    existing.tier === 'inner_circle' ||
    existing.tier === 'elite_circle'
  ) {
    return existing.tier
  }
  if (existing.tier === 'premium_member') return 'elite_circle'
  return existing.ended_paid_tier
}

export function buildSyncedMembershipBilling(input: {
  existing: MembershipBilling
  subscriptionStatus: Stripe.Subscription.Status
  cancelAtPeriodEnd: boolean
  mappedTier: PaidMembershipTier | null
  priceId: string | null
  periodStart: Date
  periodEnd: Date
  customerId: string
  subscriptionId: string
  trialEnd: Date | null
  eventCreated: number
  now?: Date
}): MembershipBilling {
  const now = input.now ?? new Date()
  const grantsAccess = subscriptionGrantsPaidAccess(input.subscriptionStatus)
  const terminal =
    input.subscriptionStatus === 'canceled' ||
    input.subscriptionStatus === 'unpaid' ||
    input.subscriptionStatus === 'incomplete_expired'
  const scheduledPeriodEnded =
    input.cancelAtPeriodEnd && input.periodEnd.getTime() <= now.getTime()
  const accessEnded = terminal || (grantsAccess && scheduledPeriodEnded)
  const internalStatus = accessEnded
    ? 'cancelled'
    : mapStripeSubscriptionStatus(input.subscriptionStatus)
  const cancelAtPeriodEnd =
    grantsAccess && input.cancelAtPeriodEnd && !accessEnded

  let tier: MembershipBilling['tier'] = input.existing.tier
  let endedPaidTier = input.existing.ended_paid_tier
  if (!accessEnded && grantsAccess && input.mappedTier) {
    tier = input.mappedTier
    endedPaidTier = null
  } else if (accessEnded) {
    endedPaidTier = rememberedPaidTier(input.existing, input.mappedTier)
    tier = 'member'
  }

  return {
    ...input.existing,
    tier,
    plan:
      !accessEnded && grantsAccess && input.mappedTier
        ? 'monthly'
        : accessEnded
          ? null
          : input.existing.plan,
    subscription_status: internalStatus,
    stripe_customer_id: input.customerId,
    stripe_subscription_id: input.subscriptionId,
    stripe_price_id: accessEnded ? null : input.priceId,
    renewal_at: accessEnded ? null : input.periodEnd.toISOString(),
    billing_period_start: input.periodStart.toISOString(),
    billing_period_end: input.periodEnd.toISOString(),
    trial_end: accessEnded ? null : (input.trialEnd?.toISOString() ?? null),
    cancelled_at: accessEnded
      ? (input.existing.cancelled_at ?? now.toISOString())
      : grantsAccess
        ? null
        : input.existing.cancelled_at,
    cancel_at_period_end: cancelAtPeriodEnd,
    stripe_event_created: input.eventCreated,
    ended_paid_tier: endedPaidTier,
    plan_change_pending: null,
    payment_failure: {
      active: input.subscriptionStatus === 'past_due',
      since:
        input.subscriptionStatus === 'past_due'
          ? (input.existing.payment_failure.since ?? now.toISOString())
          : null,
      reminder_sent_at: input.existing.payment_failure.reminder_sent_at,
    },
  }
}
