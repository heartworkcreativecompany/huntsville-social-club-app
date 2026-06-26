'use server'

import { createClient } from '@/lib/supabase/server'
import { loadActiveEntitlementCycle } from '@/lib/membership-billing-cycles'
import {
  buildMemberEntitlements,
  canUseMessaging,
  messagingUpgradeMessage,
} from '@/lib/membership-entitlements'
import { getViewer } from '@/lib/viewer'

export async function assertMessagingAllowed(): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: string }
> {
  const viewer = await getViewer()
  if (!viewer) {
    return { ok: false, error: 'You must be signed in.' }
  }

  if (!viewer.canAccessApp) {
    return { ok: false, error: 'Membership approval is required.' }
  }

  const supabase = await createClient()
  const activeCycle = await loadActiveEntitlementCycle(supabase, viewer.userId)
  const entitlements = buildMemberEntitlements({
    role: viewer.role,
    billing: viewer.profile?.membership_billing,
    applicationApproved: true,
    activeCycle,
  })

  if (!canUseMessaging(entitlements)) {
    return {
      ok: false,
      error: messagingUpgradeMessage(entitlements.productTier),
    }
  }

  return { ok: true, userId: viewer.userId }
}
