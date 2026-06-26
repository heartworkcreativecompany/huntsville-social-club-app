import { createClient } from '@/lib/supabase/server'
import { loadActiveEntitlementCycle } from '@/lib/membership-billing-cycles'
import {
  buildMemberEntitlements,
  type MemberEntitlements,
} from '@/lib/membership-entitlements'
import { getViewer } from '@/lib/viewer'

export async function loadMemberEntitlementsForViewer(): Promise<{
  entitlements: MemberEntitlements | null
  userId: string | null
}> {
  const viewer = await getViewer()
  if (!viewer) return { entitlements: null, userId: null }

  const supabase = await createClient()
  const activeCycle = await loadActiveEntitlementCycle(supabase, viewer.userId)

  const entitlements = buildMemberEntitlements({
    role: viewer.role,
    billing: viewer.profile?.membership_billing,
    applicationApproved: viewer.canAccessApp,
    activeCycle,
  })

  return { entitlements, userId: viewer.userId }
}
