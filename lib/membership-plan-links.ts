import { safeAuthCallbackNext } from '@/lib/auth-callback'
import {
  isPaidMembershipTier,
  type PaidMembershipTier,
} from '@/lib/stripe/config'

export type PricingPlanKey = 'member' | PaidMembershipTier
export type PricingSurfaceMode = 'public' | 'member'
export type MembershipPlanCtaKind =
  | 'signup'
  | 'signup_with_plan'
  | 'current_plan'
  | 'dashboard'
  | 'checkout'
  | 'portal'

export function paidMembershipPlanFromQuery(
  value: string | null | undefined
): PaidMembershipTier | null {
  const trimmed = value?.trim() ?? ''
  if (!isPaidMembershipTier(trimmed)) return null
  return trimmed
}

export function upgradePathForPlan(tier: PaidMembershipTier): string {
  return `/upgrade?plan=${tier}`
}

export function signupHrefForPaidPlan(tier: PaidMembershipTier): string {
  return `/signup?next=${encodeURIComponent(upgradePathForPlan(tier))}`
}

export function loginHrefForReturnPath(nextPath: string): string {
  return `/login?next=${encodeURIComponent(nextPath)}`
}

/** Validated paid tier from a safe `/upgrade?plan=` return path; otherwise null. */
export function paidPlanFromSafeNext(
  next: string | null | undefined
): PaidMembershipTier | null {
  const path = safeUpgradeReturnPath(next)
  if (!path) return null
  try {
    return paidMembershipPlanFromQuery(
      new URL(path, 'http://hsc.invalid').searchParams.get('plan')
    )
  } catch {
    return null
  }
}

/**
 * Only `/upgrade` or `/upgrade?plan=<canonical paid tier>`.
 * Invalid `plan` values are dropped. External URLs are rejected.
 */
export function safeUpgradeReturnPath(
  next: string | null | undefined
): string | null {
  const safe = safeAuthCallbackNext(next)
  let url: URL
  try {
    url = new URL(safe, 'http://hsc.invalid')
  } catch {
    return null
  }

  if (url.pathname !== '/upgrade') return null

  const plan = paidMembershipPlanFromQuery(url.searchParams.get('plan'))
  return plan ? upgradePathForPlan(plan) : '/upgrade'
}

export function membershipPlanCtaKind(input: {
  planKey: PricingPlanKey
  mode: PricingSurfaceMode
  currentTier: PricingPlanKey
}): MembershipPlanCtaKind {
  if (input.planKey === 'member') {
    if (input.mode === 'public') return 'signup'
    if (input.currentTier === 'member') return 'current_plan'
    return 'dashboard'
  }

  if (input.mode === 'public') return 'signup_with_plan'

  if (input.planKey === input.currentTier) return 'current_plan'

  if (input.currentTier === 'member') return 'checkout'

  return 'portal'
}
