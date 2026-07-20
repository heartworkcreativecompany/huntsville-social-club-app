import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
  isActiveRecommendationStatus,
  isArchivedRecommendationStatus,
  RE_RECOMMEND_COOLDOWN_DAYS,
} from '@/lib/compatibility/recommendation-lifecycle-config'

export type RecommendationPairRow = {
  recommended_user_id: string
  status: string
  created_at: string
  lifecycle_updated_at: string | null
}

export function pairBlocksNewRecommendation(row: RecommendationPairRow): boolean {
  if (isActiveRecommendationStatus(row.status)) {
    return true
  }

  if (!isArchivedRecommendationStatus(row.status)) {
    return false
  }

  const reference = new Date(row.lifecycle_updated_at ?? row.created_at)
  const cooldownEnds = new Date(reference)
  cooldownEnds.setDate(cooldownEnds.getDate() + RE_RECOMMEND_COOLDOWN_DAYS)

  return Date.now() < cooldownEnds.getTime()
}

export async function loadPairExclusionsForGeneration(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('curated_match_recommendations')
    .select('recommended_user_id, status, created_at, lifecycle_updated_at')
    .eq('user_id', userId)

  if (error) {
    if (error.code === '42P01') {
      return new Set()
    }
    throw new Error(error.message)
  }

  const excluded = new Set<string>()
  for (const row of (data ?? []) as RecommendationPairRow[]) {
    if (pairBlocksNewRecommendation(row)) {
      excluded.add(row.recommended_user_id)
    }
  }

  return excluded
}

export async function expireStaleRecommendations(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<number> {
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('curated_match_recommendations')
    .select('id')
    .eq('user_id', userId)
    .in('status', ['pending', 'viewed'])
    .lte('expires_at', now)

  if (error) {
    if (error.code === '42P01') {
      return 0
    }
    throw new Error(error.message)
  }

  const ids = (data ?? []).map((row) => row.id)
  if (ids.length === 0) {
    return 0
  }

  const { error: updateError } = await supabase
    .from('curated_match_recommendations')
    .update({
      status: 'expired',
      lifecycle_updated_at: now,
    })
    .in('id', ids)
    .in('status', ['pending', 'viewed'])

  if (updateError) {
    throw new Error(updateError.message)
  }

  return ids.length
}

export async function markPendingRecommendationsViewed(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<number> {
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('curated_match_recommendations')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'pending')

  if (error) {
    if (error.code === '42P01') {
      return 0
    }
    throw new Error(error.message)
  }

  const ids = (data ?? []).map((row) => row.id)
  if (ids.length === 0) {
    return 0
  }

  const { error: updateError } = await supabase
    .from('curated_match_recommendations')
    .update({
      status: 'viewed',
      lifecycle_updated_at: now,
    })
    .in('id', ids)
    .eq('status', 'pending')

  if (updateError) {
    throw new Error(updateError.message)
  }

  return ids.length
}

export async function syncRecommendationLifecycleForMember(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<{ expired: number; markedViewed: number }> {
  const expired = await expireStaleRecommendations(supabase, userId)
  const markedViewed = await markPendingRecommendationsViewed(supabase, userId)
  return { expired, markedViewed }
}
