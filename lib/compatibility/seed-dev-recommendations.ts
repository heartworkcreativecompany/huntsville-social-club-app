import { createAdminClient } from '@/lib/supabase/admin'
import { recommendationExpiresAt } from '@/lib/compatibility/recommendation-lifecycle-config'

const SAMPLE_SCORES = [91, 87, 84, 79, 76]

export function isDevRecommendationSeedAllowed(): boolean {
  return (
    process.env.NODE_ENV === 'development' &&
    process.env.COMPATIBILITY_MATCHING_ENABLED === 'true'
  )
}

export async function seedDevCuratedRecommendationsForUser(userId: string): Promise<
  | { ok: true; created: number; skipped: number }
  | { ok: false; error: string }
> {
  if (!isDevRecommendationSeedAllowed()) {
    return {
      ok: false,
      error: 'Dev recommendation seeding is only available in development.',
    }
  }

  const admin = createAdminClient()
  if (!admin) {
    return {
      ok: false,
      error:
        'SUPABASE_SERVICE_ROLE_KEY is required to seed recommendations in development.',
    }
  }

  const { data: candidates, error: candidatesError } = await admin
    .from('profiles')
    .select('id')
    .eq('application_status', 'approved')
    .contains('connection_intents', ['dating'])
    .neq('id', userId)
    .limit(12)

  if (candidatesError) {
    if (candidatesError.code === '42P01') {
      return {
        ok: false,
        error:
          'Compatibility tables are missing. Run the latest database migrations.',
      }
    }
    return { ok: false, error: candidatesError.message }
  }

  if (!candidates?.length) {
    return {
      ok: false,
      error:
        'No other approved members with Dating selected were found to recommend.',
    }
  }

  const { data: existingRows, error: existingError } = await admin
    .from('curated_match_recommendations')
    .select('recommended_user_id')
    .eq('user_id', userId)

  if (existingError && existingError.code !== '42P01') {
    return { ok: false, error: existingError.message }
  }

  const existingIds = new Set(
    (existingRows ?? []).map((row) => row.recommended_user_id)
  )
  const freshCandidates = candidates.filter(
    (candidate) => !existingIds.has(candidate.id)
  )

  if (freshCandidates.length === 0) {
    return { ok: true, created: 0, skipped: candidates.length }
  }

  const toCreate = freshCandidates.slice(0, 3)
  const now = new Date().toISOString()

  const { data: batch, error: batchError } = await admin
    .from('curated_match_batches')
    .insert({
      user_id: userId,
      status: 'delivered',
      scheduled_for: now,
      delivered_at: now,
      match_count: toCreate.length,
      generation_source: 'dev_seed',
      notification_status: 'skipped_manual',
    })
    .select('id')
    .single()

  if (batchError || !batch) {
    return {
      ok: false,
      error: batchError?.message ?? 'Failed to create a dev match batch.',
    }
  }

  const recommendations = toCreate.map((candidate, index) => ({
    batch_id: batch.id,
    user_id: userId,
    recommended_user_id: candidate.id,
    compatibility_score: SAMPLE_SCORES[index] ?? 75,
    score_breakdown: { source: 'dev_seed' },
    status: index === 0 ? 'pending' : 'viewed',
    expires_at: recommendationExpiresAt(new Date(now)),
    lifecycle_updated_at: now,
  }))

  const { error: insertError } = await admin
    .from('curated_match_recommendations')
    .insert(recommendations)

  if (insertError) {
    return { ok: false, error: insertError.message }
  }

  return {
    ok: true,
    created: toCreate.length,
    skipped: candidates.length - toCreate.length,
  }
}
