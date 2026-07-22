import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { summarizeScoreBreakdown } from '@/lib/compatibility/batch-empty-reason'
import { memberDisplayName } from '@/lib/members-discovery'

export type CuratedBatchHistoryRecommendation = {
  id: string
  recommendedUserId: string
  recommendedName: string
  compatibilityScore: number
  status: string
  scoreSummary: string[]
}

export type CuratedBatchHistoryItem = {
  id: string
  status: string
  generationSource: string | null
  scheduledFor: string
  deliveredAt: string | null
  createdAt: string
  matchCount: number
  emptyReason: string | null
  topCandidateScore: number | null
  notificationStatus: string | null
  notificationSentAt: string | null
  cancellationReason: string | null
  recipient: {
    id: string
    name: string
    email: string | null
  }
  recommendations: CuratedBatchHistoryRecommendation[]
}

export type CuratedBatchHistoryFilters = {
  status?: string
  generationSource?: string
  recipientId?: string
  limit?: number
}

type BatchRow = {
  id: string
  user_id: string
  status: string
  generation_source: string | null
  scheduled_for: string
  delivered_at: string | null
  created_at: string
  match_count: number
  empty_reason: string | null
  top_candidate_score: number | null
  notification_status: string | null
  notification_sent_at: string | null
  cancellation_reason: string | null
}

type RecommendationRow = {
  id: string
  batch_id: string
  recommended_user_id: string
  compatibility_score: number
  score_breakdown: unknown
  status: string
}

type ProfileRow = {
  id: string
  full_name: string | null
  email: string | null
}

function toMember(profile: ProfileRow | undefined, fallbackId: string) {
  return {
    id: fallbackId,
    name: profile ? memberDisplayName(profile) : 'Member',
    email: profile?.email ?? null,
  }
}

export async function loadCuratedBatchHistory(
  supabase: SupabaseClient<Database>,
  filters: CuratedBatchHistoryFilters = {}
): Promise<{ items: CuratedBatchHistoryItem[]; error: string | null }> {
  const limit = filters.limit ?? 50

  let query = supabase
    .from('curated_match_batches')
    .select(
      'id, user_id, status, generation_source, scheduled_for, delivered_at, created_at, match_count, empty_reason, top_candidate_score, notification_status, notification_sent_at, cancellation_reason'
    )
    .order('created_at', { ascending: false })
    .limit(limit)

  if (filters.status) {
    query = query.eq('status', filters.status)
  }

  if (filters.generationSource) {
    query = query.eq('generation_source', filters.generationSource)
  }

  if (filters.recipientId) {
    query = query.eq('user_id', filters.recipientId)
  }

  const { data: batchRows, error } = await query

  if (error) {
    if (error.code === '42P01') {
      return { items: [], error: null }
    }
    return { items: [], error: error.message }
  }

  const batches = (batchRows ?? []) as BatchRow[]
  if (batches.length === 0) {
    return { items: [], error: null }
  }

  const batchIds = batches.map((batch) => batch.id)
  const profileIds = new Set<string>()
  for (const batch of batches) {
    profileIds.add(batch.user_id)
  }

  const { data: recommendationRows } = await supabase
    .from('curated_match_recommendations')
    .select(
      'id, batch_id, recommended_user_id, compatibility_score, score_breakdown, status'
    )
    .in('batch_id', batchIds)
    .order('compatibility_score', { ascending: false })

  for (const row of (recommendationRows ?? []) as RecommendationRow[]) {
    profileIds.add(row.recommended_user_id)
  }

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', [...profileIds])

  const profileById = new Map<string, ProfileRow>()
  for (const profile of profiles ?? []) {
    profileById.set(profile.id, profile)
  }

  const recommendationsByBatch = new Map<string, CuratedBatchHistoryRecommendation[]>()
  for (const row of (recommendationRows ?? []) as RecommendationRow[]) {
    const bucket = recommendationsByBatch.get(row.batch_id) ?? []
    bucket.push({
      id: row.id,
      recommendedUserId: row.recommended_user_id,
      recommendedName: toMember(
        profileById.get(row.recommended_user_id),
        row.recommended_user_id
      ).name,
      compatibilityScore: row.compatibility_score,
      status: row.status,
      scoreSummary: summarizeScoreBreakdown(
        row.score_breakdown as Record<string, unknown>
      ),
    })
    recommendationsByBatch.set(row.batch_id, bucket)
  }

  const items: CuratedBatchHistoryItem[] = batches.map((batch) => ({
    id: batch.id,
    status: batch.status,
    generationSource: batch.generation_source,
    scheduledFor: batch.scheduled_for,
    deliveredAt: batch.delivered_at,
    createdAt: batch.created_at,
    matchCount: batch.match_count,
    emptyReason: batch.empty_reason,
    topCandidateScore: batch.top_candidate_score,
    notificationStatus: batch.notification_status,
    notificationSentAt: batch.notification_sent_at,
    cancellationReason: batch.cancellation_reason,
    recipient: toMember(profileById.get(batch.user_id), batch.user_id),
    recommendations: recommendationsByBatch.get(batch.id) ?? [],
  }))

  return { items, error: null }
}

export async function loadCuratedBatchHistorySummary(
  supabase: SupabaseClient<Database>
): Promise<{
  totalRecent: number
  deliveredRecent: number
  emptyRecent: number
  notificationsSentRecent: number
  error: string | null
}> {
  const since = new Date()
  since.setDate(since.getDate() - 30)

  const { data, error } = await supabase
    .from('curated_match_batches')
    .select('status, notification_status, created_at')
    .gte('created_at', since.toISOString())

  if (error) {
    if (error.code === '42P01') {
      return {
        totalRecent: 0,
        deliveredRecent: 0,
        emptyRecent: 0,
        notificationsSentRecent: 0,
        error: null,
      }
    }
    return {
      totalRecent: 0,
      deliveredRecent: 0,
      emptyRecent: 0,
      notificationsSentRecent: 0,
      error: error.message,
    }
  }

  const rows = data ?? []
  return {
    totalRecent: rows.length,
    deliveredRecent: rows.filter((row) => row.status === 'delivered').length,
    emptyRecent: rows.filter((row) => row.status === 'empty').length,
    notificationsSentRecent: rows.filter(
      (row) => row.notification_status === 'sent'
    ).length,
    error: null,
  }
}
