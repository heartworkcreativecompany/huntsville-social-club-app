import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { isCompatibilityFeatureEnabled } from '@/lib/compatibility/eligibility'
import {
  userHadMessagingBeforeBillingChange,
  userHasMessagingAfterBillingChange,
} from '@/lib/compatibility/entitlements'
import {
  onMessagingEntitlementLost,
  onMessagingEntitlementRestored,
} from '@/lib/compatibility/subscription-lifecycle'
import { revalidateCuratedMatchMemberRoutes } from '@/lib/compatibility/revalidate-curated-match-routes'
import { createAdminClient } from '@/lib/supabase/admin'
import { createMemberNotification } from '@/lib/member-notifications'

/**
 * Server-only: compare messaging entitlement before/after a billing write.
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
  if (!isCompatibilityFeatureEnabled()) return

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

  if (hadMessaging === hasMessaging) return

  const admin = createAdminClient()
  if (!admin) {
    console.error(
      '[compatibility] SUPABASE_SERVICE_ROLE_KEY missing — skipped subscription lifecycle for',
      input.userId
    )
    return
  }

  if (hadMessaging && !hasMessaging) {
    await onMessagingEntitlementLost(admin, input.userId)
    revalidateCuratedMatchMemberRoutes()
    return
  }

  if (!hadMessaging && hasMessaging) {
    await onMessagingEntitlementRestored(admin, input.userId)
    void createMemberNotification(admin, {
      userId: input.userId,
      type: 'membership_upgraded',
    })
    revalidateCuratedMatchMemberRoutes()
  }
}
