import Link from 'next/link'
import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import { BillingPortalButton } from '@/components/membership/membership-billing-buttons'
import {
  billingStatusLabel,
  parseMembershipBilling,
} from '@/lib/membership-systems'
import { buildMemberEntitlements } from '@/lib/membership-entitlements'
import { freeRegistrationsSummary } from '@/lib/membership-entitlements'
import { buttonPrimaryClassName } from '@/lib/event-labels'

export default function MemberBillingStatus({
  billingRaw,
  role = 'member',
}: {
  billingRaw: unknown
  role?: string | null
}) {
  const billing = parseMembershipBilling(billingRaw)
  const label = billingStatusLabel(billing)
  const entitlements = buildMemberEntitlements({ role, billing })
  const summary = freeRegistrationsSummary(entitlements)
  const hasPaidSubscription =
    Boolean(billing.stripe_subscription_id) &&
    (billing.subscription_status === 'active' ||
      billing.subscription_status === 'past_due' ||
      billing.subscription_status === 'grace')

  const onTrial =
    billing.trial_end && new Date(billing.trial_end).getTime() > Date.now()

  return (
    <Card padding="sm">
      <h2 className="text-display text-lg font-semibold">Membership plan</h2>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge
          variant={
            billing.payment_failure.active ||
            billing.subscription_status === 'past_due'
              ? 'warning'
              : billing.subscription_status === 'active' ||
                  entitlements.productTier !== 'member'
                ? 'success'
                : 'muted'
          }
        >
          {label}
        </Badge>
        {onTrial ? <Badge variant="accent">Trial</Badge> : null}
      </div>
      {billing.payment_failure.active ? (
        <p className="mt-3 text-sm text-muted-foreground">
          There is a payment issue on your account. Update your billing details
          to keep membership access.
        </p>
      ) : summary ? (
        <p className="mt-3 text-sm text-muted-foreground">{summary}</p>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          Upgrade to Inner Circle or Elite Circle for messaging, included standard
          event registrations, and Circle Social access.
        </p>
      )}
      {billing.renewal_at ? (
        <p className="mt-2 text-xs text-muted">
          {onTrial ? 'Trial ends' : 'Billing period renews'}:{' '}
          {new Date(onTrial ? billing.trial_end! : billing.renewal_at).toLocaleDateString()}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-3">
        {hasPaidSubscription ? (
          <BillingPortalButton />
        ) : null}
        {entitlements.productTier === 'member' ? (
          <Link href="/upgrade" className={buttonPrimaryClassName}>
            View memberships
          </Link>
        ) : null}
      </div>
    </Card>
  )
}
