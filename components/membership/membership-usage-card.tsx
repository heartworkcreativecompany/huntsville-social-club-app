import Link from 'next/link'
import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import { BillingPortalButton } from '@/components/membership/membership-billing-buttons'
import {
  buttonPrimaryClassName,
  buttonSecondaryClassName,
} from '@/lib/event-labels'
import type { MemberEntitlements } from '@/lib/membership-entitlements'
import { freeRegistrationsSummary } from '@/lib/membership-entitlements'
import type { SubscriptionStatus } from '@/lib/membership-systems'

function subscriptionStatusLabel(status: SubscriptionStatus): string {
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

export default function MembershipUsageCard({
  entitlements,
  className,
}: {
  entitlements: MemberEntitlements
  className?: string
}) {
  const billing = entitlements.billing
  const summary = freeRegistrationsSummary(entitlements)
  const hasPaidSubscription =
    Boolean(billing.stripe_subscription_id) &&
    (billing.subscription_status === 'active' ||
      billing.subscription_status === 'past_due' ||
      billing.subscription_status === 'grace')

  const onTrial =
    billing.trial_end && new Date(billing.trial_end).getTime() > Date.now()

  const periodEnd =
    entitlements.activeCycle?.period_end ?? billing.billing_period_end

  const usageLine = summary

  const statusVariant =
    billing.payment_failure.active || billing.subscription_status === 'past_due'
      ? 'warning'
      : billing.subscription_status === 'active' || entitlements.subscriptionActive
        ? 'success'
        : 'muted'

  return (
    <Card padding="sm" className={className}>
      <p className="eyebrow">Your membership</p>
      <h2 className="text-display mt-1 text-lg font-semibold">
        {entitlements.productTierLabel}
      </h2>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge variant={statusVariant}>
          {subscriptionStatusLabel(billing.subscription_status)}
        </Badge>
        {onTrial ? <Badge variant="accent">Trial</Badge> : null}
      </div>

      {billing.payment_failure.active ? (
        <p className="mt-3 text-sm text-muted-foreground">
          There is a payment issue on your account. Update your billing details
          to keep membership access.
        </p>
      ) : usageLine ? (
        <p className="mt-3 text-sm text-muted-foreground">{usageLine}</p>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          Upgrade to Inner Circle or Elite Circle for messaging, free Circle
          Socials, and premium event credits.
        </p>
      )}

      {entitlements.productTier === 'elite_circle' ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Guest invites remaining this period:{' '}
          {entitlements.guestInvitesRemaining}
        </p>
      ) : null}

      {periodEnd &&
      (entitlements.productTier === 'inner_circle' ||
        entitlements.productTier === 'elite_circle') ? (
        <p className="mt-2 text-xs text-muted">
          Current period ends: {new Date(periodEnd).toLocaleDateString()}
        </p>
      ) : null}

      {billing.renewal_at || billing.trial_end ? (
        <p className="mt-2 text-xs text-muted">
          {onTrial ? 'Trial ends' : 'Renews'}:{' '}
          {new Date(
            onTrial ? billing.trial_end! : billing.renewal_at!
          ).toLocaleDateString()}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3">
        {entitlements.productTier === 'member' ? (
          <Link href="/upgrade" className={buttonPrimaryClassName}>
            View memberships
          </Link>
        ) : null}

        {entitlements.productTier === 'inner_circle' ? (
          <>
            <Link href="/upgrade" className={buttonSecondaryClassName}>
              Change plan
            </Link>
            {hasPaidSubscription ? <BillingPortalButton /> : null}
          </>
        ) : null}

        {entitlements.productTier === 'elite_circle' && hasPaidSubscription ? (
          <BillingPortalButton />
        ) : null}
      </div>
    </Card>
  )
}
