import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { onMessagingEntitlementRestored } from '@/lib/compatibility/subscription-lifecycle'
import type { MemberEntitlements } from '@/lib/membership-entitlements'
import type { Viewer } from '@/lib/viewer'

/**
 * If billing already grants messaging but curated matches is still paused as
 * `subscription_inactive` (stale from a prior unpaid period / failed sync),
 * clear that pause so the inbox can open without waiting for another webhook.
 */
export async function healStaleSubscriptionInactivePause(
  viewer: Viewer,
  entitlements: MemberEntitlements | null
): Promise<boolean> {
  if (!entitlements?.canUseCuratedMatching) return false
  if (viewer.profile?.curated_matches_pause_reason !== 'subscription_inactive') {
    return false
  }

  const admin = createAdminClient()
  if (!admin) {
    console.error(
      '[compatibility] healStaleSubscriptionInactivePause skipped — admin client unavailable'
    )
    return false
  }

  await onMessagingEntitlementRestored(admin, viewer.userId)
  return true
}
