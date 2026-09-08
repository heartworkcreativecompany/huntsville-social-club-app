'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import { BillingPortalButton } from '@/components/membership/membership-billing-buttons'
import {
  buttonPrimaryClassName,
  buttonSecondaryClassName,
} from '@/lib/event-labels'
import type { MemberEntitlements } from '@/lib/membership-entitlements'
import { membershipCardDisplay } from '@/lib/membership-card-display'
import {
  dashboardPerkLinesFromSnapshot,
  hydrateMemberPerksFromServer,
  membershipPerksSnapshotFromEntitlements,
  useMemberPerksWithFallback,
} from '@/lib/member-perks-store'
import MembershipPerkLines from '@/components/membership/membership-perk-lines'

export default function MembershipUsageCard({
  entitlements,
  className,
}: {
  entitlements: MemberEntitlements
  className?: string
}) {
  const display = membershipCardDisplay(entitlements)
  const serverPerks = membershipPerksSnapshotFromEntitlements(entitlements)

  useEffect(() => {
    // Always hydrate — free members must clear any stale paid store snapshot.
    hydrateMemberPerksFromServer(serverPerks)
  }, [
    entitlements.productTier,
    entitlements.premiumCreditsRemaining,
    entitlements.circleSocialCreditsRemaining,
    entitlements.guestInvitesRemaining,
    entitlements.activeCycle?.credits_granted,
    entitlements.activeCycle?.circle_social_credits_granted,
    entitlements.activeCycle?.period_start,
    entitlements.activeCycle?.period_end,
  ])

  const livePerks = useMemberPerksWithFallback(serverPerks)
  const billing = entitlements.billing
  const showPaidUsage =
    display.useCircleCreditSnapshot && livePerks?.hasPaidMembership === true

  const guestInvitesRemaining = showPaidUsage
    ? (livePerks?.guestInvitesRemaining ?? entitlements.guestInvitesRemaining)
    : 0
  const periodEnd = showPaidUsage
    ? (livePerks?.periodEnd ??
      entitlements.activeCycle?.period_end ??
      billing.billing_period_end)
    : null

  const usageLines = showPaidUsage
    ? dashboardPerkLinesFromSnapshot(livePerks!)
    : display.perkLines

  const onTrial =
    billing.trial_end &&
    // eslint-disable-next-line react-hooks/purity -- trial window is relative to now
    new Date(billing.trial_end).getTime() > Date.now()

  const statusVariant =
    billing.payment_failure.active || billing.subscription_status === 'past_due'
      ? 'warning'
      : billing.subscription_status === 'active' || entitlements.subscriptionActive
        ? 'success'
        : 'muted'

  const ctaClassName =
    display.upgradeCta?.variant === 'secondary'
      ? buttonSecondaryClassName
      : buttonPrimaryClassName

  return (
    <Card padding="sm" className={className}>
      <p className="eyebrow">Your membership</p>
      <h2 className="text-display mt-1 text-lg font-semibold">{display.title}</h2>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge variant={statusVariant}>{display.statusLabel}</Badge>
        {onTrial ? <Badge variant="accent">Trial</Badge> : null}
      </div>

      {billing.payment_failure.active ? (
        <p className="mt-3 text-sm text-muted-foreground">
          There is a payment issue on your account. Update your billing details
          to keep membership access.
        </p>
      ) : (
        <div className="mt-3 min-w-0 max-w-full">
          <MembershipPerkLines lines={usageLines} />
        </div>
      )}

      {showPaidUsage && display.showGuestInvites ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Guest invites remaining this period: {guestInvitesRemaining}
        </p>
      ) : null}

      {showPaidUsage && display.showPeriodMeta && periodEnd ? (
        <p className="mt-2 text-xs text-muted">
          Current period ends: {new Date(periodEnd).toLocaleDateString()}
        </p>
      ) : null}

      {showPaidUsage &&
      display.showPeriodMeta &&
      (billing.renewal_at || billing.trial_end) ? (
        <p className="mt-2 text-xs text-muted">
          {onTrial ? 'Trial ends' : 'Renews'}:{' '}
          {new Date(
            onTrial ? billing.trial_end! : billing.renewal_at!
          ).toLocaleDateString()}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3">
        {display.upgradeCta ? (
          <Link href={display.upgradeCta.href} className={ctaClassName}>
            {display.upgradeCta.label}
          </Link>
        ) : null}

        {display.showBillingPortal ? <BillingPortalButton /> : null}
      </div>
    </Card>
  )
}
