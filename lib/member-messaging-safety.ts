import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

export type ConversationBlockState = {
  isBlocked: boolean
  blockedByViewer: boolean
  blockedByOther: boolean
}

export type ConversationReportState = {
  status: 'none' | 'pending' | 'reviewed' | 'dismissed'
}

export const CONVERSATION_REPORT_REASONS = [
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'spam', label: 'Spam or solicitation' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'safety', label: 'Safety concern' },
  { value: 'other', label: 'Other' },
] as const

export type ConversationReportReason =
  (typeof CONVERSATION_REPORT_REASONS)[number]['value']

export async function loadConversationBlockState(
  supabase: SupabaseClient<Database>,
  viewerId: string,
  otherMemberId: string
): Promise<ConversationBlockState> {
  const { data, error } = await supabase
    .from('member_member_blocks')
    .select('blocker_id, blocked_member_id')
    .or(
      `and(blocker_id.eq.${viewerId},blocked_member_id.eq.${otherMemberId}),and(blocker_id.eq.${otherMemberId},blocked_member_id.eq.${viewerId})`
    )

  if (error) {
    if (error.code === '42P01') {
      return {
        isBlocked: false,
        blockedByViewer: false,
        blockedByOther: false,
      }
    }
    return {
      isBlocked: false,
      blockedByViewer: false,
      blockedByOther: false,
    }
  }

  const blockedByViewer = (data ?? []).some(
    (row) =>
      row.blocker_id === viewerId && row.blocked_member_id === otherMemberId
  )
  const blockedByOther = (data ?? []).some(
    (row) =>
      row.blocker_id === otherMemberId && row.blocked_member_id === viewerId
  )

  return {
    isBlocked: blockedByViewer || blockedByOther,
    blockedByViewer,
    blockedByOther,
  }
}

export async function loadConversationReportState(
  supabase: SupabaseClient<Database>,
  viewerId: string,
  conversationId: string
): Promise<ConversationReportState> {
  const { data, error } = await supabase
    .from('member_conversation_reports')
    .select('status')
    .eq('reporter_id', viewerId)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    if (error.code === '42P01') {
      return { status: 'none' }
    }
    return { status: 'none' }
  }

  if (!data?.status) {
    return { status: 'none' }
  }

  if (
    data.status === 'pending' ||
    data.status === 'reviewed' ||
    data.status === 'dismissed'
  ) {
    return { status: data.status }
  }

  return { status: 'none' }
}

export async function assertConversationParticipant(
  supabase: SupabaseClient<Database>,
  viewerId: string,
  conversationId: string
): Promise<
  | {
      ok: true
      conversation: {
        id: string
        participant_a: string
        participant_b: string
      }
      otherMemberId: string
    }
  | { ok: false; error: string }
> {
  const { data: conversation, error } = await supabase
    .from('member_conversations')
    .select('id, participant_a, participant_b')
    .eq('id', conversationId)
    .maybeSingle()

  if (error) {
    return { ok: false, error: error.message }
  }

  if (
    !conversation ||
    (conversation.participant_a !== viewerId &&
      conversation.participant_b !== viewerId)
  ) {
    return { ok: false, error: 'Conversation not found.' }
  }

  const otherMemberId =
    conversation.participant_a === viewerId
      ? conversation.participant_b
      : conversation.participant_a

  return { ok: true, conversation, otherMemberId }
}
