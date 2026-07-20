'use server'

import { revalidateCuratedMatchMemberRoutes } from '@/lib/compatibility/revalidate-curated-match-routes'
import { isDevRecommendationSeedAllowed, seedDevCuratedRecommendationsForUser } from '@/lib/compatibility/seed-dev-recommendations'
import { sendMessageRequest } from '@/app/(club)/messages/actions'
import { assertMessagingAllowed } from '@/lib/require-messaging'
import { createClient } from '@/lib/supabase/server'

export async function seedDevMatchRecommendations() {
  if (!isDevRecommendationSeedAllowed()) {
    return { error: 'Dev seeding is only available in local development.' }
  }

  const gate = await assertMessagingAllowed()
  if (!gate.ok) {
    return { error: gate.error }
  }

  const result = await seedDevCuratedRecommendationsForUser(gate.userId)

  if (!result.ok) {
    return { error: result.error }
  }

  revalidateCuratedMatchMemberRoutes()

  if (result.created === 0) {
    return {
      success: true as const,
      message: 'Sample recommendations already exist for your account.',
    }
  }

  return {
    success: true as const,
    message: `Added ${result.created} sample recommendation${result.created === 1 ? '' : 's'} for testing.`,
  }
}

export async function requestCuratedMatchIntro(
  recommendationId: string,
  body: string
) {
  const gate = await assertMessagingAllowed()
  if (!gate.ok) {
    return { error: gate.error }
  }

  const supabase = await createClient()
  const { data: recommendation, error: recommendationError } = await supabase
    .from('curated_match_recommendations')
    .select('id, recommended_user_id, status')
    .eq('id', recommendationId)
    .eq('user_id', gate.userId)
    .maybeSingle()

  if (recommendationError) {
    return { error: recommendationError.message }
  }

  if (!recommendation) {
    return { error: 'This recommendation was not found in your inbox.' }
  }

  if (
    recommendation.status === 'passed' ||
    recommendation.status === 'declined' ||
    recommendation.status === 'expired'
  ) {
    return { error: 'This recommendation is no longer available.' }
  }

  const result = await sendMessageRequest({
    targetMemberId: recommendation.recommended_user_id,
    body,
    recommendationId,
  })

  if ('error' in result && result.error) {
    return { error: result.error }
  }

  revalidateCuratedMatchMemberRoutes({
    memberId: recommendation.recommended_user_id,
  })

  return {
    success: true as const,
    alreadyRequested: false,
    introStatus: 'pending' as const,
    conversationId: result.conversationId,
  }
}

export async function passCuratedRecommendation(recommendationId: string) {
  const gate = await assertMessagingAllowed()
  if (!gate.ok) {
    return { error: gate.error }
  }

  const supabase = await createClient()
  const { data: recommendation, error: recommendationError } = await supabase
    .from('curated_match_recommendations')
    .select('id, recommended_user_id, status')
    .eq('id', recommendationId)
    .eq('user_id', gate.userId)
    .maybeSingle()

  if (recommendationError) {
    return { error: recommendationError.message }
  }

  if (!recommendation) {
    return { error: 'This recommendation was not found in your inbox.' }
  }

  if (
    recommendation.status === 'passed' ||
    recommendation.status === 'declined' ||
    recommendation.status === 'expired' ||
    recommendation.status === 'accepted'
  ) {
    return { error: 'This recommendation is no longer active.' }
  }

  const { data: existingIntro, error: existingError } = await supabase
    .from('member_intro_requests')
    .select('id, status')
    .eq('requester_id', gate.userId)
    .eq('recommendation_id', recommendationId)
    .maybeSingle()

  if (existingError && existingError.code !== '42P01') {
    return { error: existingError.message }
  }

  if (existingIntro?.status === 'pending' || existingIntro?.status === 'matched') {
    return {
      error:
        'You cannot pass a recommendation while a message request is pending or active.',
    }
  }

  const now = new Date().toISOString()
  const { error: updateError } = await supabase
    .from('curated_match_recommendations')
    .update({
      status: 'passed',
      lifecycle_updated_at: now,
    })
    .eq('id', recommendationId)
    .eq('user_id', gate.userId)
    .in('status', ['pending', 'viewed'])

  if (updateError) {
    return { error: updateError.message }
  }

  revalidateCuratedMatchMemberRoutes({
    memberId: recommendation.recommended_user_id,
  })

  return { success: true as const }
}
