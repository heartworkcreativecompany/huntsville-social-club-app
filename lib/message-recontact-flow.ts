import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { validateMemberMessageBody } from '@/lib/member-message-limits'
import {
  isConversationInitiator,
  isConversationRecipient,
  type ConversationStatus,
} from '@/lib/message-request-states'
import {
  canAdminPromptRecipientReconsideration,
  canRecipientRespondToRecontact,
  canRequestRecontactReview,
  canSenderRetryAfterRecontact,
  type RecontactStatus,
} from '@/lib/message-recontact-states'

type RecontactConversationRow = {
  id: string
  participant_a: string
  participant_b: string
  status: ConversationStatus
  initiated_by: string | null
  recommendation_id: string | null
  recontact_status: RecontactStatus | null
}

export type RecontactReviewResult = {
  conversationId: string
  requesterId: string
  targetMemberId: string
  recommendationId: string | null
}

async function loadRecontactConversation(
  supabase: SupabaseClient<Database>,
  conversationId: string
): Promise<
  | { ok: true; conversation: RecontactConversationRow }
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

  return { ok: true, conversation: conversation as RecontactConversationRow }
}

function targetMemberIdFor(
  conversation: RecontactConversationRow,
  requesterId: string
): string {
  return conversation.participant_a === requesterId
    ? conversation.participant_b
    : conversation.participant_a
}

function toResult(conversation: RecontactConversationRow): RecontactReviewResult {
  const requesterId = conversation.initiated_by!
  return {
    conversationId: conversation.id,
    requesterId,
    targetMemberId: targetMemberIdFor(conversation, requesterId),
    recommendationId: conversation.recommendation_id,
  }
}

export async function requestRecontactReview(
  supabase: SupabaseClient<Database>,
  input: {
    requesterId: string
    conversationId: string
    note?: string | null
  }
): Promise<
  | { ok: true; result: RecontactReviewResult }
  | { ok: false; error: string }
> {
  const loaded = await loadRecontactConversation(supabase, input.conversationId)
  if (!loaded.ok) {
    return loaded
  }

  const { conversation } = loaded
  if (
    !canRequestRecontactReview({
      conversation,
      viewerId: input.requesterId,
    })
  ) {
    return {
      ok: false,
      error: 'You cannot request a recontact review for this conversation.',
    }
  }

  const note = input.note?.trim() || null
  if (note && note.length > 1000) {
    return { ok: false, error: 'Recontact note must be 1000 characters or fewer.' }
  }

  const now = new Date().toISOString()
  const { data: updated, error } = await supabase
    .from('member_conversations')
    .update({
      recontact_status: 'requested',
      recontact_requested_at: now,
      recontact_requested_by: input.requesterId,
      recontact_note: note,
      updated_at: now,
    })
    .eq('id', conversation.id)
    .eq('status', 'declined')
    .is('recontact_status', null)
    .select('id')
    .maybeSingle()

  if (error || !updated) {
    return {
      ok: false,
      error: error?.message ?? 'Failed to submit recontact review request.',
    }
  }

  return { ok: true, result: toResult(conversation) }
}

export async function adminPromptRecipientReconsideration(
  supabase: SupabaseClient<Database>,
  input: {
    adminId: string
    conversationId: string
  }
): Promise<
  | { ok: true; result: RecontactReviewResult }
  | { ok: false; error: string }
> {
  const loaded = await loadRecontactConversation(supabase, input.conversationId)
  if (!loaded.ok) {
    return loaded
  }

  const { conversation } = loaded
  if (
    !canAdminPromptRecipientReconsideration({
      recontactStatus: conversation.recontact_status,
    })
  ) {
    return {
      ok: false,
      error: 'This recontact request is not waiting for admin review.',
    }
  }

  const now = new Date().toISOString()
  const { data: updated, error } = await supabase
    .from('member_conversations')
    .update({
      recontact_status: 'awaiting_recipient',
      recontact_admin_actor_id: input.adminId,
      recontact_admin_reviewed_at: now,
      updated_at: now,
    })
    .eq('id', conversation.id)
    .eq('recontact_status', 'requested')
    .select('id')
    .maybeSingle()

  if (error || !updated) {
    return {
      ok: false,
      error:
        error?.message ?? 'Failed to send recontact prompt to the recipient.',
    }
  }

  return { ok: true, result: toResult(conversation) }
}

export async function respondToRecontactPrompt(
  supabase: SupabaseClient<Database>,
  input: {
    recipientId: string
    conversationId: string
    allow: boolean
  }
): Promise<
  | { ok: true; result: RecontactReviewResult; allowed: boolean }
  | { ok: false; error: string }
> {
  const loaded = await loadRecontactConversation(supabase, input.conversationId)
  if (!loaded.ok) {
    return loaded
  }

  const { conversation } = loaded
  if (!isConversationRecipient(input.recipientId, conversation)) {
    return {
      ok: false,
      error: 'Only the recipient can respond to this recontact request.',
    }
  }

  if (
    !canRecipientRespondToRecontact({
      recontactStatus: conversation.recontact_status,
    })
  ) {
    return {
      ok: false,
      error: 'This recontact request is not waiting for your response.',
    }
  }

  const now = new Date().toISOString()
  const { data: updated, error } = await supabase
    .from('member_conversations')
    .update({
      recontact_status: input.allow ? 'allowed' : 'denied',
      recontact_recipient_responded_at: now,
      updated_at: now,
    })
    .eq('id', conversation.id)
    .eq('recontact_status', 'awaiting_recipient')
    .select('id')
    .maybeSingle()

  if (error || !updated) {
    return {
      ok: false,
      error: error?.message ?? 'Failed to save your recontact response.',
    }
  }

  return {
    ok: true,
    result: toResult(conversation),
    allowed: input.allow,
  }
}

export async function retryMessageRequestAfterRecontact(
  supabase: SupabaseClient<Database>,
  input: {
    requesterId: string
    conversationId: string
    body: string
  }
): Promise<
  | { ok: true; result: RecontactReviewResult }
  | { ok: false; error: string }
> {
  const validationError = validateMemberMessageBody(input.body)
  if (validationError) {
    return { ok: false, error: validationError }
  }

  const loaded = await loadRecontactConversation(supabase, input.conversationId)
  if (!loaded.ok) {
    return loaded
  }

  const { conversation } = loaded
  if (
    !canSenderRetryAfterRecontact({
      conversation,
      viewerId: input.requesterId,
    })
  ) {
    return {
      ok: false,
      error: 'You do not have an approved second message attempt right now.',
    }
  }

  const now = new Date().toISOString()
  const { data: updated, error: updateError } = await supabase
    .from('member_conversations')
    .update({
      status: 'pending',
      recontact_status: 'consumed',
      declined_at: null,
      responded_at: null,
      updated_at: now,
    })
    .eq('id', conversation.id)
    .eq('status', 'declined')
    .eq('recontact_status', 'allowed')
    .select('id')
    .maybeSingle()

  if (updateError || !updated) {
    return {
      ok: false,
      error: updateError?.message ?? 'Failed to reopen message request.',
    }
  }

  const { error: messageError } = await supabase.from('member_messages').insert({
    conversation_id: conversation.id,
    sender_id: input.requesterId,
    body: input.body.trim(),
  })

  if (messageError) {
    await supabase
      .from('member_conversations')
      .update({
        status: 'declined',
        recontact_status: 'allowed',
      })
      .eq('id', conversation.id)
    return { ok: false, error: messageError.message }
  }

  await supabase
    .from('member_intro_requests')
    .update({
      status: 'pending',
      admin_reviewed_at: null,
    })
    .eq('conversation_id', conversation.id)

  if (conversation.recommendation_id) {
    await supabase
      .from('curated_match_recommendations')
      .update({
        status: 'viewed',
        lifecycle_updated_at: now,
      })
      .eq('id', conversation.recommendation_id)
  }

  return { ok: true, result: toResult(conversation) }
}

export async function adminDismissRecontactRequest(
  supabase: SupabaseClient<Database>,
  input: {
    adminId: string
    conversationId: string
  }
): Promise<
  | { ok: true; result: RecontactReviewResult }
  | { ok: false; error: string }
> {
  const loaded = await loadRecontactConversation(supabase, input.conversationId)
  if (!loaded.ok) {
    return loaded
  }

  const { conversation } = loaded
  if (conversation.recontact_status !== 'requested') {
    return {
      ok: false,
      error: 'This recontact request is not waiting for admin review.',
    }
  }

  const now = new Date().toISOString()
  const { data: updated, error } = await supabase
    .from('member_conversations')
    .update({
      recontact_status: 'denied',
      recontact_admin_actor_id: input.adminId,
      recontact_admin_reviewed_at: now,
      recontact_recipient_responded_at: now,
      updated_at: now,
    })
    .eq('id', conversation.id)
    .eq('recontact_status', 'requested')
    .select('id')
    .maybeSingle()

  if (error || !updated) {
    return {
      ok: false,
      error: error?.message ?? 'Failed to dismiss recontact request.',
    }
  }

  return { ok: true, result: toResult(conversation) }
}
