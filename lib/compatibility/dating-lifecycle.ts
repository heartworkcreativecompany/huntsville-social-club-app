import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { queueAutoGenerateCuratedMatches } from '@/lib/compatibility/auto-generate-matches'
import { revalidateCuratedMatchMemberRoutes } from '@/lib/compatibility/revalidate-curated-match-routes'
import { isCompatibilityFeatureEnabled } from '@/lib/compatibility/eligibility'
import { createMemberNotification } from '@/lib/member-notifications'
import {
  cancelScheduledBatches,
  clearCompatibilityPause,
  expirePendingRecommendations,
  loadCompatibilityProfileRow,
  pauseCompatibilityMatching,
} from '@/lib/compatibility/lifecycle-db'

type AdminClient = SupabaseClient<Database>

/** Server-only: member added Dating to connection options. */
export async function onDatingConnectionAdded(
  supabase: AdminClient,
  userId: string
): Promise<void> {
  if (!isCompatibilityFeatureEnabled()) return

  const profile = await loadCompatibilityProfileRow(supabase, userId)
  if (!profile) return

  const now = new Date().toISOString()

  if (profile.curated_matches_pause_reason === 'user_paused') {
    await supabase
      .from('profiles')
      .update({
        dating_connection_enabled_at: now,
        dating_connection_removed_at: null,
        updated_at: now,
      })
      .eq('id', userId)
    return
  }

  await clearCompatibilityPause(supabase, userId, {
    dating_connection_enabled_at: now,
    dating_connection_removed_at: null,
  })

  queueAutoGenerateCuratedMatches(userId, 'dating_added')
  void createMemberNotification(supabase, {
    userId,
    type: 'dating_intent_approved',
  })
  revalidateCuratedMatchMemberRoutes()
}

/** Server-only: member removed Dating from connection options. */
export async function onDatingConnectionRemoved(
  supabase: AdminClient,
  userId: string
): Promise<void> {
  if (!isCompatibilityFeatureEnabled()) return

  const now = new Date().toISOString()

  await cancelScheduledBatches(supabase, userId, 'dating_removed')
  await expirePendingRecommendations(supabase, userId)
  await pauseCompatibilityMatching(supabase, userId, 'dating_removed', {
    dating_connection_removed_at: now,
  })

  revalidateCuratedMatchMemberRoutes()
}
