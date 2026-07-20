import type { SupabaseClient } from '@supabase/supabase-js'
import { loadBlockedUserIdsForMember } from '@/lib/compatibility/match-candidate-pool'
import type { Database } from '@/lib/database.types'
import { MEMBER_PROFILES_VIEW } from '@/lib/member-profiles-view'
import { validateMemberMessageBody } from '@/lib/member-message-limits'
import { orderedPair } from '@/lib/member-messages'
import {
  isConversationRecipient,
  validateMessageRequestCreation,
  type ConversationStatus,
} from '@/lib/message-request-states'
import { retryMessageRequestAfterRecontact } from '@/lib/message-recontact-flow'
import { isMessagingSuspended } from '@/lib/messaging-suspension'

type ConversationRow = {
  id: string
  participant_a: string
  participant_b: string
  status: ConversationStatus
  initiated_by: string | null
  recommendation_id: string | null
  recontact_status: import('@/lib/message-recontact-states').RecontactStatus | null
}

export type CreateMessageRequestResult = {
  conversationId: string
  targetMemberId: string
  recommendationId: string | null
}

export type RespondToMessageRequestResult = {
  conversationId: string
  requesterId: string
  targetMemberId: string
  recommendationId: string | null
}

async function loadConversationForPair(
  supabase: SupabaseClient<Database>,
  userIdA: string,
  userIdB: string
): Promise<ConversationRow | null> {
  const [participant_a, participant_b] = orderedPair(userIdA, userIdB)
  const { data, error } = await supabase
    .from('member_conversations')
    .select(
      'id, participant_a, participant_b, status, initiated_by, recommendation_id, recontact_status'
    )
    .eq('participant_a', participant_a)
    .eq('participant_b', participant_b)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data as ConversationRow | null
}

async function validateParticipants(
  supabase: SupabaseClient<Database>,
  requesterId: string,
  targetMemberId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: profiles, error } = await supabase
    .from(MEMBER_PROFILES_VIEW)
    .select('id, messaging_suspended_at, application_status')
    .in('id', [requesterId, targetMemberId])

  if (error) {
    return { ok: false, error: error.message }
  }

  if ((profiles ?? []).length !== 2) {
    return { ok: false, error: 'Member profile not found.' }
  }

  for (const profile of profiles ?? []) {
    if (profile.application_status !== 'approved') {
      return { ok: false, error: 'Both members must be approved to message.' }
    }

    if (isMessagingSuspended(profile)) {
      return {
        ok: false,
        error: 'Messaging is suspended for one of the members in this request.',
      }
    }
  }

  const requesterBlocks = await loadBlockedUserIdsForMember(
    supabase,
    requesterId
  )
  if (requesterBlocks.has(targetMemberId)) {
    return { ok: false, error: 'You cannot message this member.' }
  }

  const targetBlocks = await loadBlockedUserIdsForMember(
    supabase,
    targetMemberId
  )
  if (targetBlocks.has(requesterId)) {
    return { ok: false, error: 'This member is unavailable for messaging.' }
  }

  return { ok: true }
}

export async function createMessageRequest(
  supabase: SupabaseClient<Database>,
  input: {
    requesterId: string
    targetMemberId: string
    body: string
    recommendationId?: string | null
  }
): Promise<
  | { ok: true; result: CreateMessageRequestResult }
  | { ok: false; error: string }
> {
  if (input.requesterId === input.targetMemberId) {
    return { ok: false, error: 'You cannot message yourself.' }
  }

  const validationError = validateMemberMessageBody(input.body)
  if (validationError) {
    return { ok: false, error: validationError }
  }

  const participants = await validateParticipants(
    supabase,
    input.requesterId,
    input.targetMemberId
  )
  if (!participants.ok) {
    return participants
  }

  const existing = await loadConversationForPair(
    supabase,
    input.requesterId,
    input.targetMemberId
  )

  if (
    existing?.status === 'declined' &&
    existing.recontact_status === 'allowed'
  ) {
    return retryMessageRequestAfterRecontact(supabase, {
      requesterId: input.requesterId,
      conversationId: existing.id,
      body: input.body,
    }).then((retry) => {
      if (!retry.ok) {
        return retry
      }
      return {
        ok: true as const,
        result: {
          conversationId: retry.result.conversationId,
          targetMemberId: retry.result.targetMemberId,
          recommendationId: retry.result.recommendationId,
        },
      }
    })
  }

  const creationCheck = validateMessageRequestCreation({
    existingStatus: existing?.status ?? null,
    recontactStatus: existing?.recontact_status ?? null,
  })
  if (!creationCheck.ok) {
    return creationCheck
  }

  if (input.recommendationId) {
    const { data: recommendation, error: recommendationError } = await supabase
      .from('curated_match_recommendations')
      .select('id, recommended_user_id, status')
      .eq('id', input.recommendationId)
      .eq('user_id', input.requesterId)
      .maybeSingle()

    if (recommendationError) {
      return { ok: false, error: recommendationError.message }
    }

    if (!recommendation) {
      return { ok: false, error: 'This recommendation was not found.' }
    }

    if (recommendation.recommended_user_id !== input.targetMemberId) {
      return { ok: false, error: 'Recommendation does not match this member.' }
    }

    if (
      recommendation.status === 'passed' ||
      recommendation.status === 'declined' ||
      recommendation.status === 'expired'
    ) {
      return { ok: false, error: 'This recommendation is no longer available.' }
    }

    const { data: existingIntro } = await supabase
      .from('member_intro_requests')
      .select('id, status')
      .eq('requester_id', input.requesterId)
      .eq('recommendation_id', input.recommendationId)
      .maybeSingle()

    if (
      existingIntro?.status === 'pending' ||
      existingIntro?.status === 'matched'
    ) {
      return {
        ok: false,
        error: 'You already sent a message request for this match.',
      }
    }
  }

  const [participant_a, participant_b] = orderedPair(
    input.requesterId,
    input.targetMemberId
  )
  const now = new Date().toISOString()

  const { data: conversation, error: conversationError } = await supabase
    .from('member_conversations')
    .insert({
      participant_a,
      participant_b,
      status: 'pending',
      initiated_by: input.requesterId,
      recommendation_id: input.recommendationId ?? null,
      updated_at: now,
    })
    .select('id')
    .single()

  if (conversationError || !conversation) {
    return {
      ok: false,
      error: conversationError?.message ?? 'Failed to create message request.',
    }
  }

  const { error: messageError } = await supabase.from('member_messages').insert({
    conversation_id: conversation.id,
    sender_id: input.requesterId,
    body: input.body.trim(),
  })

  if (messageError) {
    await supabase.from('member_conversations').delete().eq('id', conversation.id)
    return { ok: false, error: messageError.message }
  }

  if (input.recommendationId) {
    const { error: introError } = await supabase
      .from('member_intro_requests')
      .insert({
        requester_id: input.requesterId,
        target_member_id: input.targetMemberId,
        kind: 'member',
        recommendation_id: input.recommendationId,
        status: 'pending',
        conversation_id: conversation.id,
      })

    if (introError && introError.code !== '23505') {
      await supabase.from('member_conversations').delete().eq('id', conversation.id)
      return { ok: false, error: introError.message }
    }
  } else {
    const { data: existingIntro } = await supabase
      .from('member_intro_requests')
      .select('id')
      .eq('requester_id', input.requesterId)
      .eq('target_member_id', input.targetMemberId)
      .is('recommendation_id', null)
      .eq('status', 'pending')
      .maybeSingle()

    if (!existingIntro) {
      await supabase.from('member_intro_requests').insert({
        requester_id: input.requesterId,
        target_member_id: input.targetMemberId,
        kind: 'member',
        status: 'pending',
        conversation_id: conversation.id,
      })
    }
  }

  return {
    ok: true,
    result: {
      conversationId: conversation.id,
      targetMemberId: input.targetMemberId,
      recommendationId: input.recommendationId ?? null,
    },
  }
}

async function loadPendingConversation(
  supabase: SupabaseClient<Database>,
  conversationId: string
): Promise<
  | { ok: true; conversation: ConversationRow }
  | { ok: false; error: string }
> {
  const { data: conversation, error } = await supabase
    .from('member_conversations')
    .select(
      'id, participant_a, participant_b, status, initiated_by, recommendation_id, recontact_status'
    )
    .eq('id', conversationId)
    .maybeSingle()

  if (error) {
    return { ok: false, error: error.message }
  }

  if (!conversation) {
    return { ok: false, error: 'Conversation not found.' }
  }

  if (conversation.status !== 'pending') {
    return { ok: false, error: 'This message request has already been answered.' }
  }

  return { ok: true, conversation: conversation as ConversationRow }
}

export async function acceptMessageRequest(
  supabase: SupabaseClient<Database>,
  input: {
    responderId: string
    conversationId: string
  }
): Promise<
  | { ok: true; result: RespondToMessageRequestResult }
  | { ok: false; error: string }
> {
  const loaded = await loadPendingConversation(supabase, input.conversationId)
  if (!loaded.ok) {
    return loaded
  }

  const { conversation } = loaded
  if (!isConversationRecipient(input.responderId, conversation)) {
    return { ok: false, error: 'Only the recipient can accept this request.' }
  }

  const requesterId = conversation.initiated_by
  if (!requesterId) {
    return { ok: false, error: 'Message request is missing a sender.' }
  }

  const targetMemberId =
    conversation.participant_a === requesterId
      ? conversation.participant_b
      : conversation.participant_a

  const participants = await validateParticipants(
    supabase,
    requesterId,
    targetMemberId
  )
  if (!participants.ok) {
    return participants
  }

  const now = new Date().toISOString()

  const { data: updated, error: updateError } = await supabase
    .from('member_conversations')
    .update({
      status: 'accepted',
      responded_at: now,
      updated_at: now,
    })
    .eq('id', conversation.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()

  if (updateError || !updated) {
    return {
      ok: false,
      error: updateError?.message ?? 'Failed to accept message request.',
    }
  }

  await supabase
    .from('member_intro_requests')
    .update({
      status: 'matched',
      admin_reviewed_at: now,
      conversation_id: conversation.id,
    })
    .eq('conversation_id', conversation.id)
    .eq('status', 'pending')

  if (conversation.recommendation_id) {
    await supabase
      .from('curated_match_recommendations')
      .update({
        status: 'accepted',
        lifecycle_updated_at: now,
      })
      .eq('id', conversation.recommendation_id)
      .in('status', ['pending', 'viewed'])
  }

  return {
    ok: true,
    result: {
      conversationId: conversation.id,
      requesterId,
      targetMemberId,
      recommendationId: conversation.recommendation_id,
    },
  }
}

export async function declineMessageRequest(
  supabase: SupabaseClient<Database>,
  input: {
    responderId: string
    conversationId: string
  }
): Promise<
  | { ok: true; result: RespondToMessageRequestResult }
  | { ok: false; error: string }
> {
  const loaded = await loadPendingConversation(supabase, input.conversationId)
  if (!loaded.ok) {
    return loaded
  }

  const { conversation } = loaded
  if (!isConversationRecipient(input.responderId, conversation)) {
    return { ok: false, error: 'Only the recipient can decline this request.' }
  }

  const requesterId = conversation.initiated_by
  if (!requesterId) {
    return { ok: false, error: 'Message request is missing a sender.' }
  }

  const targetMemberId =
    conversation.participant_a === requesterId
      ? conversation.participant_b
      : conversation.participant_a

  const now = new Date().toISOString()

  const { data: updated, error: updateError } = await supabase
    .from('member_conversations')
    .update({
      status: 'declined',
      responded_at: now,
      declined_at: now,
      updated_at: now,
    })
    .eq('id', conversation.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()

  if (updateError || !updated) {
    return {
      ok: false,
      error: updateError?.message ?? 'Failed to decline message request.',
    }
  }

  await supabase
    .from('member_intro_requests')
    .update({
      status: 'declined',
      admin_reviewed_at: now,
      conversation_id: conversation.id,
    })
    .eq('conversation_id', conversation.id)
    .eq('status', 'pending')

  if (conversation.recommendation_id) {
    await supabase
      .from('curated_match_recommendations')
      .update({
        status: 'declined',
        lifecycle_updated_at: now,
      })
      .eq('id', conversation.recommendation_id)
      .in('status', ['pending', 'viewed'])
  }

  return {
    ok: true,
    result: {
      conversationId: conversation.id,
      requesterId,
      targetMemberId,
      recommendationId: conversation.recommendation_id,
    },
  }
}
