'use client'

import Link from 'next/link'
import {
  BillingPortalButton,
  MembershipCheckoutButton,
} from '@/components/membership/membership-billing-buttons'
import { PRICING_PLANS } from '@/lib/membership-pricing-copy'
import {
  membershipPlanCtaKind,
  signupHrefForPaidPlan,
  type PricingPlanKey,
  type PricingSurfaceMode,
} from '@/lib/membership-plan-links'
import type { PaidMembershipTier } from '@/lib/stripe/config'

export default function MembershipPlanCta({
  planKey,
  mode,
  currentTier,
  className,
  selected = false,
}: {
  planKey: PricingPlanKey
  mode: PricingSurfaceMode
  currentTier: PricingPlanKey
  className: string
  selected?: boolean
}) {
  const kind = membershipPlanCtaKind({ planKey, mode, currentTier })
  const label = PRICING_PLANS[planKey].cta

  if (kind === 'signup') {
    return (
      <Link href="/signup" className={className}>
        {label}
      </Link>
    )
  }

  if (kind === 'dashboard') {
    return (
      <Link href="/dashboard" className={className}>
        {label}
      </Link>
    )
  }

  if (kind === 'signup_with_plan' && planKey !== 'member') {
    return (
      <Link
        href={signupHrefForPaidPlan(planKey)}
        className={className}
        aria-current={selected ? 'page' : undefined}
      >
        {label}
      </Link>
    )
  }

  if (kind === 'current_plan') {
    return (
      <span className="text-sm font-medium text-muted-foreground">
        Current plan
      </span>
    )
  }

  if (kind === 'portal') {
    return (
      <BillingPortalButton className={className}>{label}</BillingPortalButton>
    )
  }

  return (
    <MembershipCheckoutButton
      tier={planKey as PaidMembershipTier}
      className={className}
    >
      {label}
    </MembershipCheckoutButton>
  )
}
