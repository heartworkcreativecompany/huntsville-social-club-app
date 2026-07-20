import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { loadBlockedUserIdsForMember } from '@/lib/compatibility/match-candidate-pool'
import { ensureMemberConversation } from '@/lib/member-conversation'
import { insertCuratedIntroWelcomeMessage } from '@/lib/member-welcome-message'
import { isMessagingSuspended } from '@/lib/messaging-suspension'

type IntroRow = {
  id: string
  status: string
  requester_id: string
  target_member_id: string | null
  recommendation_id: string | null
}

type RecommendationRow = {
  id: string
  user_id: string
  recommended_user_id: string
  status: string
}

type MemberProfileRow = {
  id: string
  messaging_suspended_at: string | null
}

export type CuratedIntroMatchResult = {
  introRequestId: string
  conversationId: string
  requesterId: string
  targetMemberId: string
}

export type CuratedIntroDeclineResult = {
  introRequestId: string
  requesterId: string
  targetMemberId: string | null
}

async function loadPendingCuratedIntro(
  supabase: SupabaseClient<Database>,
  introRequestId: string
): Promise<
  | { ok: true; intro: IntroRow }
  | { ok: false; error: string }
> {
  const { data: intro, error } = await supabase
    .from('member_intro_requests')
    .select('id, status, requester_id, target_member_id, recommendation_id')
    .eq('id', introRequestId)
    .maybeSingle()

  if (error) {
    return { ok: false, error: error.message }
  }

  if (!intro) {
    return { ok: false, error: 'Intro request not found.' }
  }

  if (!intro.recommendation_id) {
    return { ok: false, error: 'This is not a curated match intro request.' }
  }

  if (intro.status !== 'pending') {
    return { ok: false, error: 'This intro request has already been reviewed.' }
  }

  if (!intro.target_member_id) {
    return { ok: false, error: 'Intro request is missing a recommended member.' }
  }

  return { ok: true, intro }
}

async function loadMatchableRecommendation(
  supabase: SupabaseClient<Database>,
  intro: IntroRow
): Promise<
  | { ok: true; recommendation: RecommendationRow }
  | { ok: false; error: string }
> {
  const { data: recommendation, error } = await supabase
    .from('curated_match_recommendations')
    .select('id, user_id, recommended_user_id, status')
    .eq('id', intro.recommendation_id!)
    .maybeSingle()

  if (error) {
    return { ok: false, error: error.message }
  }

  if (!recommendation) {
    return { ok: false, error: 'The linked recommendation was not found.' }
  }

  if (recommendation.user_id !== intro.requester_id) {
    return { ok: false, error: 'Intro request does not match the recommendation owner.' }
  }

  if (recommendation.recommended_user_id !== intro.target_member_id) {
    return {
      ok: false,
      error: 'Intro request does not match the recommended member.',
    }
  }

  if (
    recommendation.status !== 'pending' &&
    recommendation.status !== 'viewed'
  ) {
    return {
      ok: false,
      error: `Recommendation is ${recommendation.status} and cannot be matched.`,
    }
  }

  return { ok: true, recommendation }
}

async function loadMemberProfiles(
  supabase: SupabaseClient<Database>,
  userIds: string[]
): Promise<
  | { ok: true; profiles: MemberProfileRow[] }
  | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, messaging_suspended_at')
    .in('id', userIds)

  if (error) {
    return { ok: false, error: error.message }
  }

  if ((data ?? []).length !== userIds.length) {
    return { ok: false, error: 'One or more member profiles could not be loaded.' }
  }

  return { ok: true, profiles: data ?? [] }
}

async function validateCuratedIntroParticipants(
  supabase: SupabaseClient<Database>,
  requesterId: string,
  targetMemberId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const profiles = await loadMemberProfiles(supabase, [requesterId, targetMemberId])
  if (!profiles.ok) {
    return profiles
  }

  for (const profile of profiles.profiles) {
    if (isMessagingSuspended(profile)) {
      return {
        ok: false,
        error: 'Messaging is suspended for one of the members in this intro.',
      }
    }
  }

  const requesterBlocks = await loadBlockedUserIdsForMember(supabase, requesterId)
  if (requesterBlocks.has(targetMemberId)) {
    return {
      ok: false,
      error: 'These members have blocked each other and cannot be matched.',
    }
  }

  const targetBlocks = await loadBlockedUserIdsForMember(supabase, targetMemberId)
  if (targetBlocks.has(requesterId)) {
    return {
      ok: false,
      error: 'These members have blocked each other and cannot be matched.',
    }
  }

  return { ok: true }
}

async function rollbackIntroMatch(
  supabase: SupabaseClient<Database>,
  introRequestId: string,
  recommendationId: string,
  previousRecommendationStatus: string
): Promise<void> {
  await supabase
    .from('member_intro_requests')
    .update({
      status: 'pending',
      admin_notes: null,
      admin_reviewed_at: null,
      conversation_id: null,
    })
    .eq('id', introRequestId)
    .eq('status', 'matched')

  await supabase
    .from('curated_match_recommendations')
    .update({
      status: previousRecommendationStatus,
    })
    .eq('id', recommendationId)
    .eq('status', 'accepted')
}

export async function matchCuratedIntroRequest(
  supabase: SupabaseClient<Database>,
  introRequestId: string,
  adminNotes?: string
): Promise<
  | { ok: true; result: CuratedIntroMatchResult }
  | { ok: false; error: string }
> {
  const loaded = await loadPendingCuratedIntro(supabase, introRequestId)
  if (!loaded.ok) {
    return loaded
  }

  const { intro } = loaded
  const recommendationLoaded = await loadMatchableRecommendation(supabase, intro)
  if (!recommendationLoaded.ok) {
    return recommendationLoaded
  }

  const { recommendation } = recommendationLoaded
  const participants = await validateCuratedIntroParticipants(
    supabase,
    intro.requester_id,
    intro.target_member_id!
  )
  if (!participants.ok) {
    return participants
  }

  const reviewedAt = new Date().toISOString()
  const previousRecommendationStatus = recommendation.status

  const conversation = await ensureMemberConversation(
    supabase,
    intro.requester_id,
    intro.target_member_id!
  )

  if (!conversation.ok) {
    return conversation
  }

  const { data: acceptedRecommendation, error: recommendationError } =
    await supabase
      .from('curated_match_recommendations')
      .update({
        status: 'accepted',
        lifecycle_updated_at: reviewedAt,
      })
      .eq('id', recommendation.id)
      .in('status', ['pending', 'viewed'])
      .select('id')
      .maybeSingle()

  if (recommendationError) {
    return { ok: false, error: recommendationError.message }
  }

  if (!acceptedRecommendation) {
    return {
      ok: false,
      error: 'Recommendation is no longer available for matching.',
    }
  }

  const { data: matchedIntro, error: introError } = await supabase
    .from('member_intro_requests')
    .update({
      status: 'matched',
      admin_notes: adminNotes?.trim() || null,
      admin_reviewed_at: reviewedAt,
      conversation_id: conversation.conversationId,
    })
    .eq('id', introRequestId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()

  if (introError || !matchedIntro) {
    await supabase
      .from('curated_match_recommendations')
      .update({
        status: previousRecommendationStatus,
      })
      .eq('id', recommendation.id)
      .eq('status', 'accepted')

    return {
      ok: false,
      error: introError?.message ?? 'Failed to mark intro request as matched.',
    }
  }

  const welcome = await insertCuratedIntroWelcomeMessage(supabase, {
    conversationId: conversation.conversationId,
    requesterId: intro.requester_id,
  })

  if (!welcome.ok) {
    await rollbackIntroMatch(
      supabase,
      introRequestId,
      recommendation.id,
      previousRecommendationStatus
    )
    return welcome
  }

  return {
    ok: true,
    result: {
      introRequestId,
      conversationId: conversation.conversationId,
      requesterId: intro.requester_id,
      targetMemberId: intro.target_member_id!,
    },
  }
}

async function rollbackIntroDecline(
  supabase: SupabaseClient<Database>,
  introRequestId: string,
  recommendationId: string,
  previousRecommendationStatus: string
): Promise<void> {
  await supabase
    .from('member_intro_requests')
    .update({
      status: 'pending',
      admin_notes: null,
      admin_reviewed_at: null,
    })
    .eq('id', introRequestId)
    .eq('status', 'declined')

  await supabase
    .from('curated_match_recommendations')
    .update({
      status: previousRecommendationStatus,
    })
    .eq('id', recommendationId)
    .in('status', ['declined'])
}

export async function declineCuratedIntroRequest(
  supabase: SupabaseClient<Database>,
  introRequestId: string,
  adminNotes?: string
): Promise<
  | { ok: true; result: CuratedIntroDeclineResult }
  | { ok: false; error: string }
> {
  const loaded = await loadPendingCuratedIntro(supabase, introRequestId)
  if (!loaded.ok) {
    return loaded
  }

  const { intro } = loaded
  const recommendationLoaded = await loadMatchableRecommendation(supabase, intro)
  if (!recommendationLoaded.ok) {
    return recommendationLoaded
  }

  const { recommendation } = recommendationLoaded
  const reviewedAt = new Date().toISOString()
  const previousRecommendationStatus = recommendation.status

  const { data: declinedIntro, error: introError } = await supabase
    .from('member_intro_requests')
    .update({
      status: 'declined',
      admin_notes: adminNotes?.trim() || null,
      admin_reviewed_at: reviewedAt,
    })
    .eq('id', introRequestId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()

  if (introError || !declinedIntro) {
    return {
      ok: false,
      error: introError?.message ?? 'Failed to decline intro request.',
    }
  }

  const { data: declinedRecommendation, error: recommendationError } =
    await supabase
      .from('curated_match_recommendations')
      .update({
        status: 'declined',
        lifecycle_updated_at: reviewedAt,
      })
      .eq('id', recommendation.id)
      .in('status', ['pending', 'viewed'])
      .select('id')
      .maybeSingle()

  if (recommendationError || !declinedRecommendation) {
    await rollbackIntroDecline(
      supabase,
      introRequestId,
      recommendation.id,
      previousRecommendationStatus
    )
    return {
      ok: false,
      error:
        recommendationError?.message ??
        'Recommendation is no longer available to decline.',
    }
  }

  return {
    ok: true,
    result: {
      introRequestId,
      requesterId: intro.requester_id,
      targetMemberId: intro.target_member_id,
    },
  }
}
