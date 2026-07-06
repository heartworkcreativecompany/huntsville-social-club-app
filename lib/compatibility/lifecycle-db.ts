import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import type { CuratedMatchPauseReason } from '@/lib/compatibility/types'

type AdminClient = SupabaseClient<Database>
type ProfileUpdate = Database['public']['Tables']['profiles']['Update']

export async function cancelScheduledBatches(
  supabase: AdminClient,
  userId: string,
  cancellationReason: string
): Promise<void> {
  const { error } = await supabase
    .from('curated_match_batches')
    .update({
      status: 'cancelled',
      cancellation_reason: cancellationReason,
    })
    .eq('user_id', userId)
    .eq('status', 'scheduled')

  if (error && error.code !== '42P01') {
    throw new Error(error.message)
  }
}

export async function expirePendingRecommendations(
  supabase: AdminClient,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from('curated_match_recommendations')
    .update({ status: 'expired' })
    .eq('user_id', userId)
    .in('status', ['pending', 'viewed'])

  if (error && error.code !== '42P01') {
    throw new Error(error.message)
  }
}

export async function pauseCompatibilityMatching(
  supabase: AdminClient,
  userId: string,
  reason: CuratedMatchPauseReason,
  extra: ProfileUpdate = {}
): Promise<void> {
  const now = new Date().toISOString()
  const patch: ProfileUpdate = {
    curated_matches_paused_at: now,
    curated_matches_pause_reason: reason,
    updated_at: now,
    ...extra,
  }

  if (reason === 'user_paused') {
    patch.wants_curated_matches = false
  }

  const { error } = await supabase.from('profiles').update(patch).eq('id', userId)

  if (error) {
    throw new Error(error.message)
  }
}

export async function clearCompatibilityPause(
  supabase: AdminClient,
  userId: string,
  extra: ProfileUpdate = {}
): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('profiles')
    .update({
      curated_matches_paused_at: null,
      curated_matches_pause_reason: null,
      wants_curated_matches: true,
      updated_at: now,
      ...extra,
    })
    .eq('id', userId)

  if (error) {
    throw new Error(error.message)
  }
}

export type CompatibilityProfileRow = {
  connections_open_to: string[] | null
  wants_curated_matches: boolean | null
  curated_matches_pause_reason: string | null
  compatibility_completed_at: string | null
  membership_billing: unknown
  role: string | null
}

export async function loadCompatibilityProfileRow(
  supabase: AdminClient,
  userId: string
): Promise<CompatibilityProfileRow | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(
      'connections_open_to, wants_curated_matches, curated_matches_pause_reason, compatibility_completed_at, membership_billing, role'
    )
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    if (error.code === '42P01' || error.message?.includes('does not exist')) {
      return null
    }
    throw new Error(error.message)
  }

  return data
}
