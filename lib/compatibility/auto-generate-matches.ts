import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import type { CuratedBatchGenerationSource } from '@/lib/compatibility/batch-generation-source'
import { isCompatibilityFeatureEnabled } from '@/lib/compatibility/eligibility'
import { canAttemptAutoGenerate } from '@/lib/compatibility/auto-generate-guards'
import { generateCuratedRecommendationsForUser } from '@/lib/compatibility/generate-recommendations'
import { revalidateCuratedMatchMemberRoutes } from '@/lib/compatibility/revalidate-curated-match-routes'
import {
  loadMatchPoolProfileForUser,
  type MatchPoolProfile,
} from '@/lib/compatibility/match-candidate-pool'
import { notifyCuratedMatchesDelivered } from '@/lib/curated-match-notifications'
import { createAdminClient } from '@/lib/supabase/admin'

export type AutoGenerateTrigger =
  | 'questionnaire_completed'
  | 'dating_added'
  | 'messaging_restored'
  | 'membership_approved'

export type AutoGenerateResult =
  | { attempted: false; reason: string }
  | {
      attempted: true
      outcome: 'delivered' | 'empty' | 'skipped'
      created: number
      batchId: string | null
      notified: boolean
      detail: string | null
    }

function triggerToGenerationSource(
  trigger: AutoGenerateTrigger
): CuratedBatchGenerationSource {
  switch (trigger) {
    case 'questionnaire_completed':
      return 'auto_questionnaire'
    case 'dating_added':
      return 'auto_dating'
    case 'messaging_restored':
      return 'auto_entitlement'
    case 'membership_approved':
      return 'auto_approval'
  }
}

export async function memberHasActiveRecommendations(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('curated_match_recommendations')
    .select('id')
    .eq('user_id', userId)
    .in('status', ['pending', 'viewed', 'accepted'])
    .limit(1)

  if (error) {
    if (error.code === '42P01') {
      return false
    }
    throw new Error(error.message)
  }

  return (data ?? []).length > 0
}

export async function shouldAttemptAutoGenerate(
  supabase: SupabaseClient<Database>,
  profile: MatchPoolProfile
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const eligibility = canAttemptAutoGenerate(profile)
  if (!eligibility.ok) {
    return eligibility
  }

  if (await memberHasActiveRecommendations(supabase, profile.id)) {
    return {
      ok: false,
      reason: 'Member already has active recommendations in their inbox.',
    }
  }

  return { ok: true }
}

export async function tryAutoGenerateCuratedMatches(
  userId: string,
  trigger: AutoGenerateTrigger
): Promise<AutoGenerateResult> {
  if (!isCompatibilityFeatureEnabled()) {
    return { attempted: false, reason: 'Compatibility matching is disabled.' }
  }

  const admin = createAdminClient()
  if (!admin) {
    return {
      attempted: false,
      reason: 'SUPABASE_SERVICE_ROLE_KEY is required for auto-generation.',
    }
  }

  const profile = await loadMatchPoolProfileForUser(admin, userId)
  if (!profile) {
    return { attempted: false, reason: 'Member profile not found.' }
  }

  const gate = await shouldAttemptAutoGenerate(admin, profile)
  if (!gate.ok) {
    return { attempted: false, reason: gate.reason }
  }

  const generationSource = triggerToGenerationSource(trigger)
  const result = await generateCuratedRecommendationsForUser(admin, userId, {
    generationSource,
  })

  if (result.outcome === 'skipped') {
    return {
      attempted: true,
      outcome: 'skipped',
      created: 0,
      batchId: result.batchId,
      notified: false,
      detail: result.skipReason,
    }
  }

  let notified = false
  if (result.outcome === 'delivered' && result.created > 0) {
    const notification = await notifyCuratedMatchesDelivered(admin, {
      userId,
      matchCount: result.created,
      batchId: result.batchId,
    })
    notified = notification === 'sent'
  }

  return {
    attempted: true,
    outcome: result.outcome,
    created: result.created,
    batchId: result.batchId,
    notified,
    detail: null,
  }
}

/** Fire-and-forget helper for member/admin mutation paths. */
export function queueAutoGenerateCuratedMatches(
  userId: string,
  trigger: AutoGenerateTrigger
): void {
  void tryAutoGenerateCuratedMatches(userId, trigger).then((result) => {
    if (!result.attempted) {
      console.info('[curated-matches:auto]', trigger, userId, result.reason)
      return
    }

    console.info('[curated-matches:auto]', trigger, userId, {
      outcome: result.outcome,
      created: result.created,
      notified: result.notified,
      detail: result.detail,
    })

    if (result.outcome === 'delivered' || result.outcome === 'empty') {
      revalidateCuratedMatchMemberRoutes()
    }
  })
}
