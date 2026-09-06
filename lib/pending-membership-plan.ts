import type { NextRequest, NextResponse } from 'next/server'
import {
  loginHrefForReturnPath,
  paidMembershipPlanFromQuery,
  paidPlanFromSafeNext,
  upgradePathForPlan,
} from '@/lib/membership-plan-links'
import type { PaidMembershipTier } from '@/lib/stripe/config'

export const PENDING_MEMBERSHIP_PLAN_COOKIE = 'hsc_pending_membership_plan'
export const PENDING_MEMBERSHIP_PLAN_MAX_AGE_SECONDS = 60 * 60 * 24 * 30
export const MEMBERSHIP_CONTINUATION_PATH = '/auth/continue'

const CAPTURE_PATHS = new Set(['/signup', '/login', '/auth/callback'])

export function pendingMembershipPlanFromCookie(
  value: string | null | undefined
): PaidMembershipTier | null {
  return paidMembershipPlanFromQuery(value)
}

export function capturePendingMembershipPlan(input: {
  pathname: string
  searchParams: URLSearchParams
}): PaidMembershipTier | null {
  const pathname = normalizeCapturePath(input.pathname)
  if (!CAPTURE_PATHS.has(pathname)) return null

  return (
    paidMembershipPlanFromQuery(input.searchParams.get('plan')) ??
    paidPlanFromSafeNext(input.searchParams.get('next'))
  )
}

export function pendingMembershipPlanCookieOptions(): {
  httpOnly: true
  secure: boolean
  sameSite: 'lax'
  path: '/'
  maxAge: number
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: PENDING_MEMBERSHIP_PLAN_MAX_AGE_SECONDS,
  }
}

export function applyPendingMembershipPlanCookie(
  request: NextRequest,
  response: NextResponse
): NextResponse {
  const plan = capturePendingMembershipPlan({
    pathname: request.nextUrl.pathname,
    searchParams: request.nextUrl.searchParams,
  })
  if (plan) {
    response.cookies.set(
      PENDING_MEMBERSHIP_PLAN_COOKIE,
      plan,
      pendingMembershipPlanCookieOptions()
    )
  }
  return response
}

export function setPendingMembershipPlanOnResponse(
  response: NextResponse,
  plan: PaidMembershipTier
): NextResponse {
  response.cookies.set(
    PENDING_MEMBERSHIP_PLAN_COOKIE,
    plan,
    pendingMembershipPlanCookieOptions()
  )
  return response
}

export function clearPendingMembershipPlanOnResponse(
  response: NextResponse
): NextResponse {
  response.cookies.set(PENDING_MEMBERSHIP_PLAN_COOKIE, '', {
    ...pendingMembershipPlanCookieOptions(),
    maxAge: 0,
  })
  return response
}

/**
 * Post-auth continuation. Cookie/query may only carry a canonical paid tier.
 * Never returns an arbitrary `next` URL. Does not start checkout.
 */
export function resolveMembershipContinuation(input: {
  signedIn: boolean
  approved: boolean
  cookiePlan: PaidMembershipTier | null
  requestedPlan?: string | null
}): { path: string; clearCookie: boolean } {
  const plan =
    paidMembershipPlanFromQuery(input.requestedPlan) ?? input.cookiePlan

  if (!input.signedIn) {
    return {
      path: plan ? loginHrefForReturnPath(upgradePathForPlan(plan)) : '/login',
      clearCookie: false,
    }
  }

  if (!input.approved) {
    return { path: '/application', clearCookie: false }
  }

  if (!plan) {
    return { path: '/dashboard', clearCookie: false }
  }

  return { path: upgradePathForPlan(plan), clearCookie: true }
}

function normalizeCapturePath(pathname: string): string {
  const path = pathname.split('?')[0] || '/'
  if (path.length > 1 && path.endsWith('/')) return path.slice(0, -1)
  return path || '/'
}
