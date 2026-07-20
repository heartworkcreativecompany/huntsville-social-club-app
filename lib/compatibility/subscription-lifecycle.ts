import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { queueAutoGenerateCuratedMatches } from '@/lib/compatibility/auto-generate-matches'
import { revalidateCuratedMatchMemberRoutes } from '@/lib/compatibility/revalidate-curated-match-routes'
import {
  isCompatibilityFeatureEnabled,
  isDatingConnectionSelected,
} from '@/lib/compatibility/eligibility'
import { createMemberNotification } from '@/lib/member-notifications'
import {
  cancelScheduledBatches,
  clearCompatibilityPause,
  expirePendingRecommendations,
  loadCompatibilityProfileRow,
  pauseCompatibilityMatching,
} from '@/lib/compatibility/lifecycle-db'

type AdminClient = SupabaseClient<Database>

/** Server-only: paid messaging entitlement lost (downgrade, lapse, past_due). */
export async function onMessagingEntitlementLost(
  supabase: AdminClient,
  userId: string
): Promise<void> {
  if (!isCompatibilityFeatureEnabled()) return

  const profile = await loadCompatibilityProfileRow(supabase, userId)
  if (!profile) return

  const now = new Date().toISOString()

  await cancelScheduledBatches(supabase, userId, 'subscription_inactive')
  await expirePendingRecommendations(supabase, userId)
  await pauseCompatibilityMatching(supabase, userId, 'subscription_inactive', {
    messaging_entitlement_lost_at: now,
  })

  revalidateCuratedMatchMemberRoutes()
}

/** Server-only: paid messaging entitlement restored. */
export async function onMessagingEntitlementRestored(
  supabase: AdminClient,
  userId: string
): Promise<void> {
  if (!isCompatibilityFeatureEnabled()) return

  const profile = await loadCompatibilityProfileRow(supabase, userId)
  if (!profile) return

  if (profile.curated_matches_pause_reason === 'user_paused') {
    await supabase
      .from('profiles')
      .update({
        messaging_entitlement_restored_at: new Date().toISOString(),
        messaging_entitlement_lost_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
    return
  }

  if (!isDatingConnectionSelected(profile.connection_intents)) {
    return
  }

  await clearCompatibilityPause(supabase, userId, {
    messaging_entitlement_restored_at: new Date().toISOString(),
    messaging_entitlement_lost_at: null,
  })

  if (!profile.compatibility_completed_at) {
    void createMemberNotification(supabase, {
      userId,
      type: 'compatibility_questionnaire_ready',
    })
  }

  queueAutoGenerateCuratedMatches(userId, 'messaging_restored')
  revalidateCuratedMatchMemberRoutes()
}
