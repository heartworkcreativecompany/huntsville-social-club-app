import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { isFriendshipMatchingEnabled } from '@/lib/friendship/eligibility'
import {
  hasMessagingEntitlement,
  isApprovedMember,
} from '@/lib/compatibility/eligibility'
import { createMemberNotification } from '@/lib/member-notifications'
import { loadCompatibilityProfileRow } from '@/lib/compatibility/lifecycle-db'
import { loadActiveMembershipAccessOverride } from '@/lib/membership-access-override/admin'
import { loadActiveEntitlementCycle } from '@/lib/membership-billing-cycles'
import { isUsableIntentEventId } from '@/lib/profile-revision'

type AdminClient = SupabaseClient<Database>

/**
 * Server-only: member added Friends to connection options.
 * Creates a friendship_intent_approved notification only if all of:
 *   - FRIENDSHIP_MATCHING_ENABLED is on
 *   - application_status === 'approved'
 *   - member has recognized paid messaging entitlement (incl. complimentary override)
 *   - a non-empty stable intentEventId from profile-revision submit is present
 */
export async function onFriendshipConnectionAdded(
  supabase: AdminClient,
  userId: string,
  intentEventId?: string | null
): Promise<void> {
  if (!isFriendshipMatchingEnabled()) return
  if (!isUsableIntentEventId(intentEventId)) return

  const profile = await loadCompatibilityProfileRow(supabase, userId)
  if (!profile) return

  if (!isApprovedMember(profile.application_status)) return

  const [activeCycle, accessOverride] = await Promise.all([
    loadActiveEntitlementCycle(supabase, userId),
    loadActiveMembershipAccessOverride(supabase, userId),
  ])

  if (
    !hasMessagingEntitlement({
      role: profile.role,
      billing: profile.membership_billing,
      applicationApproved: true,
      activeCycle,
      accessOverride,
    })
  ) {
    return
  }

  await createMemberNotification(supabase, {
    userId,
    type: 'friendship_intent_approved',
    metadata: { intent_event_id: intentEventId.trim() },
  })
}
