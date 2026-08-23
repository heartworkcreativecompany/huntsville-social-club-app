import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/database.types'
import { loadBlockedUserIdsForMember } from '@/lib/compatibility/match-candidate-pool'
import { isFriendshipMatchingEnabled } from '@/lib/friendship/eligibility'
import {
  MIN_FRIENDSHIP_RECOMMENDATION_SCORE,
  scoreFriendshipPair,
} from '@/lib/friendship/scoring'
import { isRecommendableFriendshipScore } from '@/lib/friendship/labels'
import {
  loadFriendshipMatchPool,
  loadPassedFriendshipCandidateIds,
  type FriendshipPoolProfile,
} from '@/lib/friendship/candidate-pool'

export const FRIENDSHIP_RECOMMENDATIONS_PER_BATCH = 4

export type FriendshipGenerationResult = {
  userId: string
  outcome: 'delivered' | 'empty' | 'skipped'
  created: number
  batchId: string | null
  skipReason: string | null
}

function rankFriendshipCandidates(
  recipient: FriendshipPoolProfile,
  pool: FriendshipPoolProfile[],
  options: {
    blockedUserIds: Set<string>
    passedUserIds: Set<string>
  }
) {
  const scored: {
    candidateId: string
    score: number
    breakdown: Record<string, unknown>
    reasons: string[]
  }[] = []

  for (const candidate of pool) {
    if (candidate.id === recipient.id) continue
    if (options.blockedUserIds.has(candidate.id)) continue
    if (options.passedUserIds.has(candidate.id)) continue

    const result = scoreFriendshipPair(
      recipient.questionnaire.answers,
      candidate.questionnaire.answers
    )

    if (
      result.score < MIN_FRIENDSHIP_RECOMMENDATION_SCORE ||
      !isRecommendableFriendshipScore(result.score)
    ) {
      continue
    }

    scored.push({
      candidateId: candidate.id,
      score: result.score,
      breakdown: result.breakdown,
      reasons: result.reasons,
    })
  }

  scored.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score
    }
    return left.candidateId.localeCompare(right.candidateId)
  })

  return scored
}

export async function refreshFriendshipRecommendationsForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  options: { pool?: FriendshipPoolProfile[] } = {}
): Promise<FriendshipGenerationResult> {
  if (!isFriendshipMatchingEnabled()) {
    return {
      userId,
      outcome: 'skipped',
      created: 0,
      batchId: null,
      skipReason: 'Friendship matching is disabled.',
    }
  }
  const { profiles, error } =
    options.pool != null
      ? { profiles: options.pool, error: null }
      : await loadFriendshipMatchPool(supabase)

  if (error) {
    throw new Error(error)
  }

  const recipient = profiles.find((profile) => profile.id === userId) ?? null
  if (!recipient) {
    return {
      userId,
      outcome: 'skipped',
      created: 0,
      batchId: null,
      skipReason: 'Member is not eligible for friendship recommendations.',
    }
  }

  const blockedUserIds = await loadBlockedUserIdsForMember(supabase, userId)
  const passedUserIds = await loadPassedFriendshipCandidateIds(supabase, userId)
  const ranked = rankFriendshipCandidates(recipient, profiles, {
    blockedUserIds,
    passedUserIds,
  })
  const selected = ranked.slice(0, FRIENDSHIP_RECOMMENDATIONS_PER_BATCH)
  const now = new Date().toISOString()

  const { data: batch, error: batchError } = await supabase
    .from('friendship_match_batches')
    .insert({
      user_id: userId,
      status: selected.length > 0 ? 'delivered' : 'empty',
      match_count: selected.length,
      delivered_at: now,
    })
    .select('id')
    .single()

  if (batchError || !batch) {
    throw new Error(batchError?.message ?? 'Failed to create friendship match batch.')
  }

  const selectedIds = new Set(selected.map((item) => item.candidateId))

  const { data: existing } = await supabase
    .from('friendship_match_recommendations')
    .select('id, recommended_user_id, status')
    .eq('user_id', userId)

  const existingByCandidate = new Map(
    (existing ?? []).map((row) => [row.recommended_user_id, row])
  )

  for (const row of existing ?? []) {
    if (row.status === 'passed') {
      continue
    }
    if (!selectedIds.has(row.recommended_user_id)) {
      await supabase
        .from('friendship_match_recommendations')
        .update({ status: 'expired', updated_at: now })
        .eq('id', row.id)
    }
  }

  for (const candidate of selected) {
    const current = existingByCandidate.get(candidate.candidateId)
    const payload = {
      batch_id: batch.id,
      user_id: userId,
      recommended_user_id: candidate.candidateId,
      compatibility_score: candidate.score,
      score_breakdown: {
        ...candidate.breakdown,
        reasons: candidate.reasons,
      } as Json,
      status: current?.status === 'viewed' ? 'viewed' : 'pending',
      updated_at: now,
    }

    if (current && current.status !== 'passed') {
      const { error: updateError } = await supabase
        .from('friendship_match_recommendations')
        .update(payload)
        .eq('id', current.id)
      if (updateError) {
        throw new Error(updateError.message)
      }
    } else if (!current) {
      const { error: insertError } = await supabase
        .from('friendship_match_recommendations')
        .insert(payload)
      if (insertError) {
        throw new Error(insertError.message)
      }
    }
  }

  return {
    userId,
    outcome: selected.length > 0 ? 'delivered' : 'empty',
    created: selected.length,
    batchId: batch.id,
    skipReason: null,
  }
}

export async function rescoreFriendshipRecommendationsInvolving(
  supabase: SupabaseClient<Database>,
  changedUserId: string
): Promise<number> {
  if (!isFriendshipMatchingEnabled()) {
    return 0
  }
  const { data: inbound, error } = await supabase
    .from('friendship_match_recommendations')
    .select('id, user_id, status')
    .eq('recommended_user_id', changedUserId)
    .in('status', ['pending', 'viewed'])

  if (error) {
    if (error.code === '42P01') {
      return 0
    }
    throw new Error(error.message)
  }

  const viewerIds = [...new Set((inbound ?? []).map((row) => row.user_id))]
  const { profiles } = await loadFriendshipMatchPool(supabase)
  let refreshed = 0

  for (const viewerId of viewerIds) {
    await refreshFriendshipRecommendationsForUser(supabase, viewerId, { pool: profiles })
    refreshed += 1
  }

  return refreshed
}

export async function refreshFriendshipRecommendationsForAllEligible(
  supabase: SupabaseClient<Database>
): Promise<{ processed: number; delivered: number; empty: number; skipped: number }> {
  if (!isFriendshipMatchingEnabled()) {
    return { processed: 0, delivered: 0, empty: 0, skipped: 0 }
  }
  const { profiles, error } = await loadFriendshipMatchPool(supabase)
  if (error) {
    throw new Error(error)
  }

  let delivered = 0
  let empty = 0
  let skipped = 0

  for (const profile of profiles) {
    const result = await refreshFriendshipRecommendationsForUser(supabase, profile.id, {
      pool: profiles,
    })
    if (result.outcome === 'delivered') delivered += 1
    else if (result.outcome === 'empty') empty += 1
    else skipped += 1
  }

  return {
    processed: profiles.length,
    delivered,
    empty,
    skipped,
  }
}
