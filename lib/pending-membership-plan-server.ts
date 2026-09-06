import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import {
  MEMBERSHIP_CONTINUATION_PATH,
  PENDING_MEMBERSHIP_PLAN_COOKIE,
  pendingMembershipPlanFromCookie,
} from '@/lib/pending-membership-plan'
import type { PaidMembershipTier } from '@/lib/stripe/config'

export async function readPendingMembershipPlanFromCookies(): Promise<PaidMembershipTier | null> {
  const store = await cookies()
  return pendingMembershipPlanFromCookie(
    store.get(PENDING_MEMBERSHIP_PLAN_COOKIE)?.value
  )
}

/** After approval, send the member through the continuation route once. */
export async function redirectIfPendingMembershipPlan(approved: boolean) {
  if (!approved) return
  const plan = await readPendingMembershipPlanFromCookies()
  if (plan) redirect(MEMBERSHIP_CONTINUATION_PATH)
}
