import { loadActiveEntitlementCycle } from '@/lib/membership-billing-cycles'
import { buildMemberEntitlementsWithOverride } from '@/lib/load-member-entitlements'
import {
  canUseCuratedMatching,
  canUseMessaging,
  type MemberEntitlements,
} from '@/lib/membership-entitlements'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

export async function loadMemberEntitlementsForUser(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string
    role?: string | null
    billing?: unknown
    applicationApproved?: boolean
  }
): Promise<MemberEntitlements> {
  const activeCycle = await loadActiveEntitlementCycle(supabase, input.userId)
  return buildMemberEntitlementsWithOverride({
    userId: input.userId,
    role: input.role,
    billing: input.billing,
    applicationApproved: input.applicationApproved ?? true,
    activeCycle,
  })
}

export async function userHadMessagingBeforeBillingChange(
  supabase: SupabaseClient<Database>,
  userId: string,
  previousBilling: unknown,
  role?: string | null
): Promise<boolean> {
  const entitlements = await loadMemberEntitlementsForUser(supabase, {
    userId,
    role,
    billing: previousBilling,
    applicationApproved: true,
  })
  return canUseMessaging(entitlements)
}

export async function userHasMessagingAfterBillingChange(
  supabase: SupabaseClient<Database>,
  userId: string,
  nextBilling: unknown,
  role?: string | null
): Promise<boolean> {
  const entitlements = await loadMemberEntitlementsForUser(supabase, {
    userId,
    role,
    billing: nextBilling,
    applicationApproved: true,
  })
  return canUseMessaging(entitlements)
}

export async function userHadCuratedMatchingBeforeBillingChange(
  supabase: SupabaseClient<Database>,
  userId: string,
  previousBilling: unknown,
  role?: string | null
): Promise<boolean> {
  const entitlements = await loadMemberEntitlementsForUser(supabase, {
    userId,
    role,
    billing: previousBilling,
    applicationApproved: true,
  })
  return canUseCuratedMatching(entitlements)
}

export async function userHasCuratedMatchingAfterBillingChange(
  supabase: SupabaseClient<Database>,
  userId: string,
  nextBilling: unknown,
  role?: string | null
): Promise<boolean> {
  const entitlements = await loadMemberEntitlementsForUser(supabase, {
    userId,
    role,
    billing: nextBilling,
    applicationApproved: true,
  })
  return canUseCuratedMatching(entitlements)
}
