import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
  onMessagingEntitlementLost,
  onMessagingEntitlementRestored,
} from '@/lib/compatibility/subscription-lifecycle'
import { expirePendingFriendshipRecommendations } from '@/lib/friendship/friendship-lifecycle'
import { queueFriendshipRecommendationRefresh } from '@/lib/friendship/auto-generate'
import { revalidateCuratedMatchMemberRoutes } from '@/lib/compatibility/revalidate-curated-match-routes'
import { revalidateFriendshipRoutes } from '@/lib/friendship/revalidate-routes'
import { createAdminClient } from '@/lib/supabase/admin'
import { createMemberNotification } from '@/lib/member-notifications'
import {
  userHadCuratedMatchingBeforeBillingChange,
  userHadMessagingBeforeBillingChange,
  userHasCuratedMatchingAfterBillingChange,
  userHasMessagingAfterBillingChange,
} from '@/lib/compatibility/entitlements'

/**
 * Server-only: compare curated matching (and messaging) before/after a billing write.
 * Call from Stripe sync paths after membership_billing is updated.
 */
export async function runCompatibilitySubscriptionLifecycle(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string
    previousBilling: unknown
    nextBilling: unknown
    role?: string | null
  }
): Promise<void> {
  const hadMatching = await userHadCuratedMatchingBeforeBillingChange(
    supabase,
    input.userId,
    input.previousBilling,
    input.role
  )
  const hasMatching = await userHasCuratedMatchingAfterBillingChange(
    supabase,
    input.userId,
    input.nextBilling,
    input.role
  )
  const hadMessaging = await userHadMessagingBeforeBillingChange(
    supabase,
    input.userId,
    input.previousBilling,
    input.role
  )
  const hasMessaging = await userHasMessagingAfterBillingChange(
    supabase,
    input.userId,
    input.nextBilling,
    input.role
  )

  const matchingChanged = hadMatching !== hasMatching
  const messagingGained = !hadMessaging && hasMessaging

  if (!matchingChanged && !messagingGained) return

  const admin = createAdminClient()
  if (!admin) {
    console.error(
      '[compatibility] SUPABASE_SERVICE_ROLE_KEY missing — skipped subscription lifecycle for',
      input.userId
    )
    return
  }

  if (hadMatching && !hasMatching) {
    await onMessagingEntitlementLost(admin, input.userId)
    await expirePendingFriendshipRecommendations(admin, input.userId)
    revalidateCuratedMatchMemberRoutes()
    revalidateFriendshipRoutes()
  }

  if (!hadMatching && hasMatching) {
    await onMessagingEntitlementRestored(admin, input.userId)
    queueFriendshipRecommendationRefresh(input.userId)
    revalidateCuratedMatchMemberRoutes()
    revalidateFriendshipRoutes()
  }

  if (messagingGained) {
    void createMemberNotification(admin, {
      userId: input.userId,
      type: 'membership_upgraded',
    })
  }
}
