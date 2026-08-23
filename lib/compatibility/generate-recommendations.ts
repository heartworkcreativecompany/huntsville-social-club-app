import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
  isCompatibilityFeatureEnabled,
  canGenerateMatches,
} from '@/lib/compatibility/eligibility'
import {
  MIN_COMPATIBILITY_SCORE,
  RECOMMENDATIONS_PER_BATCH,
} from '@/lib/compatibility/generation-config'
import { recommendationExpiresAt } from '@/lib/compatibility/recommendation-lifecycle-config'
import {
  isCandidateAvailable,
  loadBlockedUserIdsForMember,
  loadMatchPoolProfiles,
  listEligibleRecipients,
  type MatchPoolProfile,
} from '@/lib/compatibility/match-candidate-pool'
import type { CuratedBatchGenerationSource } from '@/lib/compatibility/batch-generation-source'
import type { CuratedBatchNotificationStatus } from '@/lib/compatibility/batch-generation-source'
import {
  deriveEmptyBatchReason,
  countScorablePoolCandidates,
} from '@/lib/compatibility/batch-empty-reason'
import { loadPairExclusionsForGeneration } from '@/lib/curated-recommendation-lifecycle'
import { scoreCompatibilityPair } from '@/lib/compatibility/scoring'

export type RecommendationGenerationOutcome =
  | 'delivered'
  | 'empty'
  | 'skipped'

export type UserGenerationResult = {
  userId: string
  outcome: RecommendationGenerationOutcome
  created: number
  batchId: string | null
  skipReason: string | null
  topScore: number | null
}

export type BatchGenerationSummary = {
  processed: number
  delivered: number
  empty: number
  skipped: number
  recommendationsCreated: number
  results: UserGenerationResult[]
  error: string | null
}

type ScoredCandidate = {
  candidateId: string
  score: number
  breakdown: Record<string, number | string>
}

export type GenerateRecommendationsOptions = {
  pool?: MatchPoolProfile[]
  generationSource?: CuratedBatchGenerationSource
  notificationStatus?: CuratedBatchNotificationStatus | null
}

function recipientEligibilityReason(profile: MatchPoolProfile | null): string | null {
  if (!profile) {
    return 'Member not found.'
  }

  if (!isCompatibilityFeatureEnabled()) {
    return 'Compatibility matching is disabled.'
  }

  if (
    !canGenerateMatches(profile, {
      role: profile.role,
      billing: profile.membership_billing,
      applicationApproved: profile.application_status === 'approved',
      accessOverride: profile.accessOverride ?? null,
    })
  ) {
    return 'Member is not eligible for new recommendations.'
  }

  return null
}

async function markBatchProcessing(
  supabase: SupabaseClient<Database>,
  batchId: string
): Promise<void> {
  const { error } = await supabase
    .from('curated_match_batches')
    .update({ status: 'processing' })
    .eq('id', batchId)

  if (error) {
    throw new Error(error.message)
  }
}

async function finalizeBatch(
  supabase: SupabaseClient<Database>,
  input: {
    batchId: string
    userId: string
    status: 'delivered' | 'empty'
    matchCount: number
    deliveredAt: string
    emptyReason?: string | null
    topCandidateScore?: number | null
    notificationStatus?: CuratedBatchNotificationStatus | null
  }
): Promise<void> {
  const { error: batchError } = await supabase
    .from('curated_match_batches')
    .update({
      status: input.status,
      delivered_at: input.deliveredAt,
      match_count: input.matchCount,
      empty_reason: input.emptyReason ?? null,
      top_candidate_score: input.topCandidateScore ?? null,
      notification_status: input.notificationStatus ?? null,
      notification_sent_at:
        input.notificationStatus === 'sent' ? input.deliveredAt : null,
    })
    .eq('id', input.batchId)

  if (batchError) {
    throw new Error(batchError.message)
  }

  const profileUpdate: {
    last_match_review_at: string
    updated_at: string
    last_match_generation_at?: string
  } = {
    last_match_review_at: input.deliveredAt,
    updated_at: input.deliveredAt,
  }

  if (input.status === 'delivered' && input.matchCount > 0) {
    profileUpdate.last_match_generation_at = input.deliveredAt
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update(profileUpdate)
    .eq('id', input.userId)

  if (profileError) {
    throw new Error(profileError.message)
  }
}

function rankCandidates(
  recipient: MatchPoolProfile,
  candidates: MatchPoolProfile[],
  options: {
    blockedUserIds: Set<string>
    excludedRecommendedIds: Set<string>
  }
): ScoredCandidate[] {
  const scored: ScoredCandidate[] = []

  for (const candidate of candidates) {
    if (candidate.id === recipient.id) {
      continue
    }

    if (
      !isCandidateAvailable(candidate, {
        excludeUserIds: new Set([recipient.id]),
        blockedUserIds: options.blockedUserIds,
      })
    ) {
      continue
    }

    if (options.excludedRecommendedIds.has(candidate.id)) {
      continue
    }

    const { score, breakdown } = scoreCompatibilityPair(recipient, candidate)
    if (score < MIN_COMPATIBILITY_SCORE) {
      continue
    }

    scored.push({
      candidateId: candidate.id,
      score,
      breakdown,
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

function bestAvailableScore(
  recipient: MatchPoolProfile,
  candidates: MatchPoolProfile[],
  options: {
    blockedUserIds: Set<string>
    excludedRecommendedIds: Set<string>
  }
): number | null {
  let best: number | null = null

  for (const candidate of candidates) {
    if (candidate.id === recipient.id) {
      continue
    }

    if (
      !isCandidateAvailable(candidate, {
        excludeUserIds: new Set([recipient.id]),
        blockedUserIds: options.blockedUserIds,
      })
    ) {
      continue
    }

    if (options.excludedRecommendedIds.has(candidate.id)) {
      continue
    }

    const { score } = scoreCompatibilityPair(recipient, candidate)
    if (best == null || score > best) {
      best = score
    }
  }

  return best
}

export async function generateCuratedRecommendationsForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  options: GenerateRecommendationsOptions = {}
): Promise<UserGenerationResult> {
  const profiles =
    options.pool ??
    (await loadMatchPoolProfiles(supabase)).profiles

  const recipient = profiles.find((profile) => profile.id === userId) ?? null
  const skipReason = recipientEligibilityReason(recipient)
  if (skipReason) {
    return {
      userId,
      outcome: 'skipped',
      created: 0,
      batchId: null,
      skipReason,
      topScore: null,
    }
  }

  const blockedUserIds = await loadBlockedUserIdsForMember(supabase, userId)
  const excludedRecommendedIds = await loadPairExclusionsForGeneration(
    supabase,
    userId
  )

  const ranked = rankCandidates(recipient!, profiles, {
    blockedUserIds,
    excludedRecommendedIds,
  })
  const bestScore =
    ranked[0]?.score ??
    bestAvailableScore(recipient!, profiles, {
      blockedUserIds,
      excludedRecommendedIds,
    })

  const now = new Date().toISOString()
  const selected = ranked.slice(0, RECOMMENDATIONS_PER_BATCH)
  const generationSource = options.generationSource ?? 'scheduled'
  const manualNotificationStatus =
    generationSource === 'manual_all' || generationSource === 'manual_member'
      ? ('skipped_manual' as const)
      : null

  const { data: batch, error: batchError } = await supabase
    .from('curated_match_batches')
    .insert({
      user_id: userId,
      status: 'scheduled',
      scheduled_for: now,
      match_count: 0,
      generation_source: generationSource,
    })
    .select('id')
    .single()

  if (batchError || !batch) {
    throw new Error(batchError?.message ?? 'Failed to create match batch.')
  }

  await markBatchProcessing(supabase, batch.id)

  if (selected.length === 0) {
    const emptyReason = deriveEmptyBatchReason({
      rankedCount: ranked.length,
      poolCandidateCount: countScorablePoolCandidates(profiles.length),
      topScore: bestScore,
    })

    await finalizeBatch(supabase, {
      batchId: batch.id,
      userId,
      status: 'empty',
      matchCount: 0,
      deliveredAt: now,
      emptyReason,
      topCandidateScore: bestScore,
      notificationStatus: 'skipped_empty',
    })

    return {
      userId,
      outcome: 'empty',
      created: 0,
      batchId: batch.id,
      skipReason: null,
      topScore: bestScore,
    }
  }

  const recommendations = selected.map((candidate) => ({
    batch_id: batch.id,
    user_id: userId,
    recommended_user_id: candidate.candidateId,
    compatibility_score: candidate.score,
    score_breakdown: candidate.breakdown,
    status: 'pending' as const,
    expires_at: recommendationExpiresAt(new Date(now)),
    lifecycle_updated_at: now,
  }))

  const { error: insertError } = await supabase
    .from('curated_match_recommendations')
    .insert(recommendations)

  if (insertError) {
    throw new Error(insertError.message)
  }

  await finalizeBatch(supabase, {
    batchId: batch.id,
    userId,
    status: 'delivered',
    matchCount: selected.length,
    deliveredAt: now,
    topCandidateScore: selected[0]?.score ?? null,
    notificationStatus:
      options.notificationStatus ?? manualNotificationStatus,
  })

  return {
    userId,
    outcome: 'delivered',
    created: selected.length,
    batchId: batch.id,
    skipReason: null,
    topScore: selected[0]?.score ?? null,
  }
}

export async function generateCuratedRecommendationsForAllEligible(
  supabase: SupabaseClient<Database>,
  options: Pick<GenerateRecommendationsOptions, 'generationSource'> = {}
): Promise<BatchGenerationSummary> {
  if (!isCompatibilityFeatureEnabled()) {
    return {
      processed: 0,
      delivered: 0,
      empty: 0,
      skipped: 0,
      recommendationsCreated: 0,
      results: [],
      error: 'Compatibility matching is disabled.',
    }
  }

  const { profiles, error } = await loadMatchPoolProfiles(supabase)
  if (error) {
    return {
      processed: 0,
      delivered: 0,
      empty: 0,
      skipped: 0,
      recommendationsCreated: 0,
      results: [],
      error,
    }
  }

  const recipients = listEligibleRecipients(profiles)
  const results: UserGenerationResult[] = []

  for (const recipient of recipients) {
    const result = await generateCuratedRecommendationsForUser(
      supabase,
      recipient.id,
      {
        pool: profiles,
        generationSource: options.generationSource ?? 'manual_all',
      }
    )
    results.push(result)
  }

  return {
    processed: results.length,
    delivered: results.filter((result) => result.outcome === 'delivered').length,
    empty: results.filter((result) => result.outcome === 'empty').length,
    skipped: results.filter((result) => result.outcome === 'skipped').length,
    recommendationsCreated: results.reduce(
      (total, result) => total + result.created,
      0
    ),
    results,
    error: null,
  }
}

export async function countEligibleRecommendationRecipients(
  supabase: SupabaseClient<Database>
): Promise<{ count: number; poolSize: number; error: string | null }> {
  const { profiles, error } = await loadMatchPoolProfiles(supabase)
  if (error) {
    return { count: 0, poolSize: 0, error }
  }

  return {
    count: listEligibleRecipients(profiles).length,
    poolSize: profiles.length,
    error: null,
  }
}
