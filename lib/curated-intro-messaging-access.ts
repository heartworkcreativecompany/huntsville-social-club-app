import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import type { AcceptedIdentityStatus } from '@/lib/identity-verification'

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
  /** Staff read access. Not a personal messaging entitlement. */
  adminModeration: boolean
}

export async function resolveMemberMessagingAccess(
  _supabase: SupabaseClient<Database>,
  input: {
    userId: string
    identityStatus: AcceptedIdentityStatus
    messagingSuspended: boolean
    conversationId?: string
    adminModeration?: boolean
  }
): Promise<MemberMessagingAccess> {
  void input.messagingSuspended
  void input.identityStatus

  if (input.adminModeration) {
    return {
      canAccessInbox: true,
      canAccessConversation: true,
      introOnlyAccess: false,
      adminModeration: true,
    }
  }

  // Identity and suspension gate sending, not reading an existing thread.
  return {
    canAccessInbox: true,
    canAccessConversation: true,
    introOnlyAccess: false,
    adminModeration: false,
  }
}
