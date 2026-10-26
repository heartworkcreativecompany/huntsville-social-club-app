'use client'

import { useEffect, useId, useState } from 'react'
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
  const detailsId = useId()
  const [detailsOpen, setDetailsOpen] = useState(false)
  const hasDetails =
    !billing.payment_failure.active ||
    Boolean(display.historyLabel) ||
    (showPaidUsage && display.showGuestInvites) ||
    (showPaidUsage && display.showPeriodMeta && Boolean(periodEnd)) ||
    (showPaidUsage &&
      display.showPeriodMeta &&
      Boolean(billing.renewal_at || billing.trial_end))

  return (
    <Card padding="sm" className={className}>
      <div className="flex flex-col">
        <div className="order-1">
          <p className="eyebrow">Your membership</p>
          <h2 className="text-display mt-1 text-lg font-semibold">
            {display.title}
          </h2>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge variant={statusVariant}>{display.statusLabel}</Badge>
            {onTrial ? <Badge variant="accent">Trial</Badge> : null}
          </div>

          {billing.payment_failure.active ? (
            <p className="mt-3 text-sm text-muted-foreground">
              There is a payment issue on your account. Update your billing
              details to keep membership access.
            </p>
          ) : null}
        </div>

        {hasDetails ? (
          <div
            id={detailsId}
            className={`order-4 lg:order-2 ${
              detailsOpen ? '' : 'max-lg:hidden'
            }`}
          >
            {billing.payment_failure.active ? null : (
              <div className="mt-3 min-w-0 max-w-full">
                <MembershipPerkLines lines={usageLines} />
              </div>
            )}

            {display.historyLabel ? (
              <p className="mt-3 text-sm text-muted-foreground">
                {display.historyLabel}
              </p>
            ) : null}

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
          </div>
        ) : null}

        <div className="order-2 mt-4 flex flex-wrap gap-3 lg:order-3">
          {display.upgradeCta ? (
            <Link href={display.upgradeCta.href} className={ctaClassName}>
              {display.upgradeCta.label}
            </Link>
          ) : null}

          {display.showBillingPortal ? <BillingPortalButton /> : null}
        </div>

        {hasDetails ? (
          <button
            type="button"
            className="order-3 mt-3 inline-flex w-full items-center justify-between gap-3 text-left text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 lg:hidden"
            aria-expanded={detailsOpen}
            aria-controls={detailsId}
            onClick={() => setDetailsOpen((current) => !current)}
          >
            Membership details
            <svg
              viewBox="0 0 20 20"
              aria-hidden="true"
              className={`h-5 w-5 shrink-0 text-accent motion-safe:transition-transform ${
                detailsOpen ? 'rotate-180' : ''
              }`}
            >
              <path
                d="M5 7.5 10 12.5 15 7.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        ) : null}
      </div>
    </Card>
  )
}
