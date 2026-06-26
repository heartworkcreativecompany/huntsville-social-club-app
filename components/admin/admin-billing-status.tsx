'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Badge from '@/components/ui/badge'
import {
  billingStatusLabel,
  type ApplicationFeeStatus,
  type MembershipBilling,
  type MembershipPlan,
  type SubscriptionStatus,
} from '@/lib/membership-systems'
import { buttonSecondaryClassName, inputClassName } from '@/lib/event-labels'
import { updateMembershipBilling } from '@/app/(club)/admin/applications/membership-actions'

export default function AdminBillingStatus({
  applicantId,
  billing,
}: {
  applicantId: string
  billing: MembershipBilling
}) {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()

  const save = (patch: Partial<MembershipBilling>) => {
    setMessage('')
    startTransition(async () => {
      const result = await updateMembershipBilling(applicantId, patch)
      if (result.error) {
        setMessage(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="grid gap-4 text-sm">
      <div className="flex flex-wrap gap-2">
        <Badge variant="accent">{billingStatusLabel(billing)}</Badge>
        {billing.payment_failure.active ? (
          <Badge variant="warning">Payment failure active</Badge>
        ) : null}
      </div>

      <label className="grid gap-1.5">
        <span className="font-medium text-foreground">Membership tier</span>
        <select
          className={inputClassName}
          value={billing.tier}
          disabled={isPending}
          onChange={(e) => {
            const tier = e.target.value as MembershipBilling['tier']
            const isPaidTier =
              tier === 'inner_circle' ||
              tier === 'elite_circle' ||
              tier === 'premium_member'
            save({
              tier,
              subscription_status: isPaidTier ? 'active' : billing.subscription_status,
            })
          }}
        >
          <option value="applicant">Applicant</option>
          <option value="member">Member (free)</option>
          <option value="inner_circle">Inner Circle</option>
          <option value="elite_circle">Elite Circle</option>
          <option value="premium_member">Premium member (legacy → Elite)</option>
          <option value="vendor_reviewed">Vendor reviewed</option>
          <option value="community_partner">Community partner</option>
        </select>
      </label>

      <label className="grid gap-1.5">
        <span className="font-medium text-foreground">Application fee</span>
        <select
          className={inputClassName}
          value={billing.application_fee.status}
          disabled={isPending}
          onChange={(e) =>
            save({
              application_fee: {
                ...billing.application_fee,
                status: e.target.value as ApplicationFeeStatus,
              },
            })
          }
        >
          <option value="not_required">Not required (free)</option>
          <option value="unpaid">Unpaid</option>
          <option value="paid">Paid</option>
          <option value="waived">Waived</option>
        </select>
      </label>

      <label className="grid gap-1.5">
        <span className="font-medium text-foreground">Membership plan</span>
        <select
          className={inputClassName}
          value={billing.plan ?? ''}
          disabled={isPending}
          onChange={(e) =>
            save({
              plan: (e.target.value || null) as MembershipPlan,
              subscription_status:
                e.target.value ? ('active' as SubscriptionStatus) : 'none',
            })
          }
        >
          <option value="">No plan</option>
          <option value="monthly">Monthly</option>
          <option value="quarterly">Quarterly</option>
          <option value="annual">Annual</option>
        </select>
      </label>

      <label className="grid gap-1.5">
        <span className="font-medium text-foreground">Subscription status</span>
        <select
          className={inputClassName}
          value={billing.subscription_status}
          disabled={isPending}
          onChange={(e) =>
            save({ subscription_status: e.target.value as SubscriptionStatus })
          }
        >
          <option value="none">None</option>
          <option value="active">Active</option>
          <option value="grace">Grace period</option>
          <option value="past_due">Past due</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonSecondaryClassName}
          disabled={isPending}
          onClick={() =>
            save({
              payment_failure: {
                active: true,
                since: new Date().toISOString(),
                reminder_sent_at: null,
              },
              subscription_status: 'past_due',
            })
          }
        >
          Mark payment failure
        </button>
        <button
          type="button"
          className={buttonSecondaryClassName}
          disabled={isPending}
          onClick={() =>
            save({
              payment_failure: {
                active: false,
                since: null,
                reminder_sent_at: new Date().toISOString(),
              },
            })
          }
        >
          Clear payment failure
        </button>
        <button
          type="button"
          className={buttonSecondaryClassName}
          disabled={isPending}
          onClick={() =>
            save({
              plan_change_pending: 'upgrade',
            })
          }
        >
          Flag upgrade pending
        </button>
      </div>

      {billing.renewal_at ? (
        <p className="text-xs text-muted-foreground">
          Renewal: {new Date(billing.renewal_at).toLocaleString()}
        </p>
      ) : null}

      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  )
}
