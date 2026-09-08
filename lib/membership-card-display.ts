import type { MemberEntitlements } from '@/lib/membership-entitlements'
import { membershipPerkCopyLines } from '@/lib/membership-entitlements'
import { isPaidPerksTier } from '@/lib/member-perks-snapshot'
import { FREE_MEMBER_PREMIUM_CREDITS_COPY } from '@/lib/membership-pricing-copy'
import type { SubscriptionStatus } from '@/lib/membership-systems'

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
export function membershipCardDisplay(
  entitlements: MemberEntitlements
): MembershipCardDisplay {
  const { productTier, productTierLabel, billing } = entitlements
  const isCircle = isPaidPerksTier(productTier)
  const isConnect = productTier === 'connect'
  const hasPaidSubscription = hasBlockingStripeSubscription(entitlements)

  return {
    title: productTierLabel,
    statusLabel: membershipSubscriptionStatusLabel(billing.subscription_status),
    perkLines: isCircle
      ? []
      : isConnect
        ? membershipPerkCopyLines(entitlements)
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
        : productTier === 'inner_circle'
          ? {
              href: '/upgrade',
              label: 'Change plan',
              variant: 'secondary',
            }
          : null,
    showBillingPortal: hasPaidSubscription && (isCircle || isConnect),
    showGuestInvites: isCircle && productTier === 'elite_circle',
    showPeriodMeta: isCircle,
  }
}
