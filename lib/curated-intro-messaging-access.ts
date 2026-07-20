import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

/** Accepted curated-match conversation where this member participates. */
export async function isCuratedIntroConversationForMember(
  supabase: SupabaseClient<Database>,
  userId: string,
  conversationId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('member_intro_requests')
    .select('id')
    .eq('status', 'matched')
    .eq('conversation_id', conversationId)
    .not('recommendation_id', 'is', null)
    .or(`requester_id.eq.${userId},target_member_id.eq.${userId}`)
    .limit(1)
    .maybeSingle()

  if (error) {
    if (error.code === '42P01') {
      return false
    }
    throw new Error(error.message)
  }

  return data != null
}

export async function memberHasMatchedCuratedIntroConversations(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('member_intro_requests')
    .select('id')
    .eq('status', 'matched')
    .not('conversation_id', 'is', null)
    .not('recommendation_id', 'is', null)
    .or(`requester_id.eq.${userId},target_member_id.eq.${userId}`)
    .limit(1)

  if (error) {
    if (error.code === '42P01') {
      return false
    }
    throw new Error(error.message)
  }

  return (data ?? []).length > 0
}

export async function memberHasPendingIncomingMessageRequests(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('member_conversations')
    .select('id')
    .eq('status', 'pending')
    .neq('initiated_by', userId)
    .or(`participant_a.eq.${userId},participant_b.eq.${userId}`)
    .limit(1)

  if (error) {
    if (error.code === '42P01') {
      return false
    }
    throw new Error(error.message)
  }

  return (data ?? []).length > 0
}

export async function memberHasMessageRequestConversations(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('member_conversations')
    .select('id')
    .in('status', ['pending', 'accepted'])
    .or(`participant_a.eq.${userId},participant_b.eq.${userId}`)
    .limit(1)

  if (error) {
    if (error.code === '42P01') {
      return false
    }
    throw new Error(error.message)
  }

  return (data ?? []).length > 0
}

export async function isMessageRequestConversationForMember(
  supabase: SupabaseClient<Database>,
  userId: string,
  conversationId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('member_conversations')
    .select('id')
    .eq('id', conversationId)
    .in('status', ['pending', 'accepted', 'declined'])
    .or(`participant_a.eq.${userId},participant_b.eq.${userId}`)
    .limit(1)
    .maybeSingle()

  if (error) {
    if (error.code === '42P01') {
      return false
    }
    throw new Error(error.message)
  }

  return data != null
}

export type MemberMessagingAccess = {
  canAccessInbox: boolean
  canAccessConversation: boolean
  introOnlyAccess: boolean
}

export async function resolveMemberMessagingAccess(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string
    canMessage: boolean
    messagingSuspended: boolean
    conversationId?: string
  }
): Promise<MemberMessagingAccess> {
  if (input.messagingSuspended || input.canMessage) {
    return {
      canAccessInbox: true,
      canAccessConversation: true,
      introOnlyAccess: false,
    }
  }

  const [hasIntroInbox, hasIncomingRequests, hasRequestConversations] =
    await Promise.all([
      memberHasMatchedCuratedIntroConversations(supabase, input.userId),
      memberHasPendingIncomingMessageRequests(supabase, input.userId),
      memberHasMessageRequestConversations(supabase, input.userId),
    ])

  const canAccessInbox =
    hasIntroInbox || hasIncomingRequests || hasRequestConversations

  if (input.conversationId) {
    const [isIntroConversation, isRequestConversation] = await Promise.all([
      isCuratedIntroConversationForMember(
        supabase,
        input.userId,
        input.conversationId
      ),
      isMessageRequestConversationForMember(
        supabase,
        input.userId,
        input.conversationId
      ),
    ])

    return {
      canAccessInbox,
      canAccessConversation: isIntroConversation || isRequestConversation,
      introOnlyAccess: isIntroConversation && !input.canMessage,
    }
  }

  return {
    canAccessInbox,
    canAccessConversation: false,
    introOnlyAccess: hasIntroInbox,
  }
}
