import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { isCompatibilityFeatureEnabled } from '@/lib/compatibility/eligibility'
import {
  generateCuratedRecommendationsForUser,
  type BatchGenerationSummary,
  type UserGenerationResult,
} from '@/lib/compatibility/generate-recommendations'
import {
  listDueRecipients,
  countDueRecipients,
} from '@/lib/compatibility/match-delivery-scheduler'
import {
  isEligibleRecipient,
  loadMatchPoolProfiles,
} from '@/lib/compatibility/match-candidate-pool'
import { notifyCuratedMatchesDelivered } from '@/lib/curated-match-notifications'

export type ScheduledDeliverySummary = BatchGenerationSummary & {
  dueCount: number
  notificationsSent: number
}

async function notifyDeliveredResults(
  supabase: SupabaseClient<Database>,
  results: UserGenerationResult[]
): Promise<number> {
  let sent = 0

  for (const result of results) {
    if (result.outcome !== 'delivered' || result.created <= 0) {
      continue
    }

    const notification = await notifyCuratedMatchesDelivered(supabase, {
      userId: result.userId,
      matchCount: result.created,
      batchId: result.batchId,
    })

    if (notification === 'sent') {
      sent++
    }
  }

  return sent
}

export async function runScheduledCuratedMatchDelivery(
  supabase: SupabaseClient<Database>
): Promise<ScheduledDeliverySummary> {
  if (!isCompatibilityFeatureEnabled()) {
    return {
      processed: 0,
      delivered: 0,
      empty: 0,
      skipped: 0,
      recommendationsCreated: 0,
      results: [],
      error: 'Compatibility matching is disabled.',
      dueCount: 0,
      notificationsSent: 0,
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
      dueCount: 0,
      notificationsSent: 0,
    }
  }

  const dueRecipients = listDueRecipients(profiles)
  const results: UserGenerationResult[] = []

  for (const recipient of dueRecipients) {
    const result = await generateCuratedRecommendationsForUser(
      supabase,
      recipient.id,
      {
        pool: profiles,
        generationSource: 'scheduled',
      }
    )
    results.push(result)
  }

  const notificationsSent = await notifyDeliveredResults(supabase, results)

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
    dueCount: dueRecipients.length,
    notificationsSent,
  }
}

export async function countScheduledDeliveryRecipients(
  supabase: SupabaseClient<Database>
): Promise<{
  dueCount: number
  eligibleCount: number
  poolSize: number
  error: string | null
}> {
  const { profiles, error } = await loadMatchPoolProfiles(supabase)
  if (error) {
    return { dueCount: 0, eligibleCount: 0, poolSize: 0, error }
  }

  const eligibleCount = profiles.filter((profile) =>
    isEligibleRecipient(profile)
  ).length

  return {
    dueCount: countDueRecipients(profiles),
    eligibleCount,
    poolSize: profiles.length,
    error: null,
  }
}
