import { NextResponse, type NextRequest } from 'next/server'
import {
  clearPendingMembershipPlanOnResponse,
  pendingMembershipPlanFromCookie,
  PENDING_MEMBERSHIP_PLAN_COOKIE,
  resolveMembershipContinuation,
} from '@/lib/pending-membership-plan'
import { getViewer } from '@/lib/viewer'

/**
 * Consumes a validated pending paid-plan cookie after approval.
 * Never starts Stripe Checkout.
 */
export async function GET(request: NextRequest) {
  const viewer = await getViewer()
  const cookiePlan = pendingMembershipPlanFromCookie(
    request.cookies.get(PENDING_MEMBERSHIP_PLAN_COOKIE)?.value
  )

  const { path, clearCookie } = resolveMembershipContinuation({
    signedIn: Boolean(viewer),
    approved: Boolean(viewer?.canAccessApp),
    cookiePlan,
    requestedPlan: request.nextUrl.searchParams.get('plan'),
  })

  const response = NextResponse.redirect(new URL(path, request.nextUrl.origin))
  if (clearCookie) {
    clearPendingMembershipPlanOnResponse(response)
  }
  return response
}
