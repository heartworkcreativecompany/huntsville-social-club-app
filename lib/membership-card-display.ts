import {
  membershipPerkCopyLines,
  normalizeBillingTier,
  type MemberEntitlements,
} from '@/lib/membership-entitlements'
import { scheduledCancellationHasEnded } from '@/lib/membership-billing-period'
import { isPaidPerksTier } from '@/lib/member-perks-snapshot'
import { FREE_MEMBER_PREMIUM_CREDITS_COPY } from '@/lib/membership-pricing-copy'
import { PRODUCT_TIER_LABELS } from '@/lib/membership-tier-config'
import type { SubscriptionStatus } from '@/lib/membership-systems'

/** Shown when a paid subscription has ended. Does not claim current paid benefits. */
export const ENDED_MEMBERSHIP_PERK_COPY =
  'Paid membership benefits are not currently included.'

export type MembershipCardCta = {
  href: string
  label: string
  variant: 'primary' | 'secondary'
}

export type MembershipCardDisplay = {
  title: string
  statusLabel: string
  perkLines: string[]
  useCircleCreditSnapshot: boolean
  upgradeCta: MembershipCardCta | null
  showBillingPortal: boolean
  showGuestInvites: boolean
  showPeriodMeta: boolean
  /** Previous paid plan, kept separate from the current entitlement title. */
  historyLabel: string | null
}

export function membershipSubscriptionStatusLabel(
  status: SubscriptionStatus
): string {
  switch (status) {
    case 'active':
      return 'Active'
    case 'grace':
      return 'Grace period'
    case 'past_due':
      return 'Past due'
    case 'cancelled':
      return 'Cancelled'
    default:
      return 'No subscription'
  }
}

function hasBlockingStripeSubscription(
  entitlements: MemberEntitlements
): boolean {
  const status = entitlements.billing.subscription_status
  return (
    Boolean(entitlements.billing.stripe_subscription_id) &&
    (status === 'active' || status === 'past_due' || status === 'grace')
  )
}

/**
 * Profile "Your membership" card model. Title and perks follow resolved
 * entitlements (including Stripe price-ID fallback), not a cosmetic override.
 */
function previousPaidPlanLabel(
  entitlements: MemberEntitlements
): string | null {
  if (entitlements.billingProductTier !== 'member') return null
  const ended = entitlements.billing.ended_paid_tier
  if (ended) return PRODUCT_TIER_LABELS[ended]
  const stored = normalizeBillingTier(entitlements.billing.tier)
  if (
    stored === 'connect' ||
    stored === 'inner_circle' ||
    stored === 'elite_circle'
  ) {
    return PRODUCT_TIER_LABELS[stored]
  }
  return null
}

function formatAccessEnd(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function membershipCardDisplay(
  entitlements: MemberEntitlements
): MembershipCardDisplay {
  const planTier = entitlements.billingProductTier
  const { billing } = entitlements
  const isCircle = isPaidPerksTier(planTier)
  const isConnect = planTier === 'connect'
  const hasPaidSubscription = hasBlockingStripeSubscription(entitlements)
  const scheduledUntil =
    billing.cancel_at_period_end &&
    billing.billing_period_end &&
    !scheduledCancellationHasEnded(billing)
      ? billing.billing_period_end
      : null
  const ended =
    planTier === 'member' &&
    (billing.subscription_status === 'cancelled' ||
      scheduledCancellationHasEnded(billing))
  const previousPlan = ended ? previousPaidPlanLabel(entitlements) : null
  const planEntitlements = { ...entitlements, productTier: planTier }

  return {
    title: PRODUCT_TIER_LABELS[planTier],
    statusLabel: scheduledUntil
      ? `Active until ${formatAccessEnd(scheduledUntil)}`
      : membershipSubscriptionStatusLabel(billing.subscription_status),
    perkLines: isCircle
      ? []
      : isConnect
        ? membershipPerkCopyLines(planEntitlements)
        : ended
          ? [ENDED_MEMBERSHIP_PERK_COPY]
          : [FREE_MEMBER_PREMIUM_CREDITS_COPY],
    useCircleCreditSnapshot: isCircle,
    upgradeCta: isConnect
      ? {
          href: '/upgrade',
          label: 'Upgrade to Inner Circle',
          variant: 'primary',
        }
      : !isCircle
        ? {
            href: '/upgrade',
            label: 'View memberships',
            variant: 'primary',
          }
        : planTier === 'inner_circle'
          ? {
              href: '/upgrade',
              label: 'Change plan',
              variant: 'secondary',
            }
          : null,
    showBillingPortal:
      (hasPaidSubscription && (isCircle || isConnect)) ||
      (ended && Boolean(billing.stripe_customer_id)),
    showGuestInvites: isCircle && planTier === 'elite_circle',
    showPeriodMeta: isCircle || Boolean(scheduledUntil),
    historyLabel: previousPlan
      ? `Previous plan: ${previousPlan}. This is not your current membership.`
      : null,
  }
}
