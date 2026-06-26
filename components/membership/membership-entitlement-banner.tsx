import Link from 'next/link'
import Card from '@/components/ui/card'
import { buttonPrimaryClassName, buttonSecondaryClassName } from '@/lib/event-labels'
import type { MemberEntitlements } from '@/lib/membership-entitlements'
import { freeRegistrationsSummary } from '@/lib/membership-entitlements'

export default function MembershipEntitlementBanner({
  entitlements,
}: {
  entitlements: MemberEntitlements
}) {
  const summary = freeRegistrationsSummary(entitlements)

  return (
    <Card padding="sm" className="mb-8 border-accent/20 bg-accent-soft/30">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Your membership</p>
          <p className="text-display mt-1 text-lg font-semibold">
            {entitlements.productTierLabel}
          </p>
          {summary ? (
            <p className="mt-2 text-sm text-muted-foreground">{summary}</p>
          ) : null}
        </div>
        {entitlements.productTier === 'member' ? (
          <Link href="/upgrade" className={buttonPrimaryClassName}>
            View memberships
          </Link>
        ) : entitlements.productTier === 'inner_circle' ? (
          <Link href="/upgrade" className={buttonSecondaryClassName}>
            Upgrade to Elite
          </Link>
        ) : (
          <Link href="/profile" className={buttonSecondaryClassName}>
            Manage plan
          </Link>
        )}
      </div>
    </Card>
  )
}

export { MessagingPaywall as MessagingUpgradeCard } from '@/components/membership/feature-paywalls'
