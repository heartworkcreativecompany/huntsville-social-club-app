import type { SupabaseClient } from '@supabase/supabase-js'
import { isArchivedRecommendationStatus } from '@/lib/compatibility/recommendation-lifecycle-config'
import type { Database } from '@/lib/database.types'
import type { MemberLatestBatch } from '@/lib/compatibility/member-match-availability'

export type MemberDeliverySnapshot = {
  lastMatchGenerationAt: string | null
  lastMatchReviewAt: string | null
  latestBatch: MemberLatestBatch | null
  activeRecommendationCount: number
  archivedRecommendationCount: number
}

export async function loadMemberRecommendationInboxCounts(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<{ active: number; archived: number }> {
  const { data, error } = await supabase
    .from('curated_match_recommendations')
    .select('status')
    .eq('user_id', userId)
    .in('status', ['pending', 'viewed', 'accepted', 'passed', 'declined', 'expired'])

  if (error) {
    if (error.code === '42P01') {
      return { active: 0, archived: 0 }
    }
    throw new Error(error.message)
  }

  let active = 0
  let archived = 0

  for (const row of data ?? []) {
    if (isArchivedRecommendationStatus(row.status)) {
      archived++
    } else {
      active++
    }
  }

  return { active, archived }
}

export async function loadMemberDeliverySnapshot(
  supabase: SupabaseClient<Database>,
  userId: string,
  timestamps: {
    lastMatchGenerationAt: string | null
    lastMatchReviewAt: string | null
  }
): Promise<MemberDeliverySnapshot> {
  const [batchResult, inboxCounts] = await Promise.all([
    supabase
      .from('curated_match_batches')
      .select('status, delivered_at, created_at, empty_reason, match_count')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    loadMemberRecommendationInboxCounts(supabase, userId),
  ])

  const { data: batch, error } = batchResult

  if (error) {
    if (error.code === '42P01') {
      return {
        lastMatchGenerationAt: timestamps.lastMatchGenerationAt,
        lastMatchReviewAt: timestamps.lastMatchReviewAt,
        latestBatch: null,
        activeRecommendationCount: inboxCounts.active,
        archivedRecommendationCount: inboxCounts.archived,
      }
    }
    throw new Error(error.message)
  }

  const latestBatch: MemberLatestBatch | null = batch
    ? {
        status: batch.status,
        deliveredAt: batch.delivered_at,
        createdAt: batch.created_at,
        emptyReason: batch.empty_reason,
        matchCount: batch.match_count,
      }
    : null

  return {
    lastMatchGenerationAt: timestamps.lastMatchGenerationAt,
    lastMatchReviewAt: timestamps.lastMatchReviewAt,
    latestBatch,
    activeRecommendationCount: inboxCounts.active,
    archivedRecommendationCount: inboxCounts.archived,
  }
}
