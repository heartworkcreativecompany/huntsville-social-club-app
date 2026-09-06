import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadActiveMembershipAccessOverride } from '@/lib/membership-access-override/admin'
import { loadActiveEntitlementCycle } from '@/lib/membership-billing-cycles'
import { expireConnectHoldoverMatchingForUser } from '@/lib/compatibility/expire-connect-holdover-matching'
import {
  buildMemberEntitlements,
  shouldExpireConnectHoldoverMatching,
  type EntitlementCycle,
  type MemberEntitlements,
} from '@/lib/membership-entitlements'
import { MEMBER_PROFILES_VIEW } from '@/lib/member-profiles-view'
import { getViewer } from '@/lib/viewer'

export async function buildMemberEntitlementsWithOverride(input: {
  userId: string
  role?: string | null
  billing?: unknown
  applicationApproved?: boolean
  activeCycle?: EntitlementCycle | null
  now?: Date
}): Promise<MemberEntitlements> {
  const accessOverride = await loadActiveMembershipAccessOverride(
    createAdminClient(),
    input.userId,
    input.now
  )
  return buildMemberEntitlements({
    role: input.role,
    billing: input.billing,
    applicationApproved: input.applicationApproved,
    activeCycle: input.activeCycle,
    accessOverride,
    now: input.now,
  })
}

export async function loadMemberEntitlementsForViewer(): Promise<{
  entitlements: MemberEntitlements | null
  userId: string | null
}> {
  const viewer = await getViewer()
  if (!viewer) return { entitlements: null, userId: null }

  const supabase = await createClient()
  const activeCycle = await loadActiveEntitlementCycle(supabase, viewer.userId)

  const entitlements = await buildMemberEntitlementsWithOverride({
    userId: viewer.userId,
    role: viewer.role,
    billing: viewer.profile?.membership_billing,
    applicationApproved: viewer.canAccessApp,
    activeCycle,
  })

  if (
    activeCycle &&
    shouldExpireConnectHoldoverMatching({
      productTier: entitlements.productTier,
      cycle: activeCycle,
    })
  ) {
    const admin = createAdminClient()
    if (admin) {
      try {
        await expireConnectHoldoverMatchingForUser(admin, {
          userId: viewer.userId,
          cycle: activeCycle,
          productTier: entitlements.productTier,
        })
      } catch (error) {
        console.error(
          '[membership] failed to expire Connect holdover matching for',
          viewer.userId,
          error
        )
      }
    }
  }

  return { entitlements, userId: viewer.userId }
}

/**
 * Trusted entitlement load for any member id from profiles.membership_billing
 * (+ role / application_status). Never uses Auth user_metadata.
 */
export async function loadMemberEntitlementsForUserId(
  userId: string,
  supabase?: SupabaseClient<Database>
): Promise<MemberEntitlements | null> {
  const client = supabase ?? (await createClient())
  const { data, error } = await client
    .from(MEMBER_PROFILES_VIEW)
    .select('id, role, membership_billing, application_status')
    .eq('id', userId)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  const activeCycle = await loadActiveEntitlementCycle(client, userId)
  return buildMemberEntitlementsWithOverride({
    userId,
    role: data.role,
    billing: data.membership_billing,
    applicationApproved: data.application_status === 'approved',
    activeCycle,
  })
}
