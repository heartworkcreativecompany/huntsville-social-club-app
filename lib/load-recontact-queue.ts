import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { memberDisplayName } from '@/lib/members-discovery'

export type RecontactQueueItem = {
  conversationId: string
  status: string
  recontactStatus: string
  recontactRequestedAt: string
  recontactNote: string | null
  recommendationId: string | null
  requester: {
    id: string
    name: string
    email: string | null
  }
  recipient: {
    id: string
    name: string
    email: string | null
  }
  originalMessage: string | null
  originalMessageAt: string | null
}

type ConversationRow = {
  id: string
  status: string
  recontact_status: string
  recontact_requested_at: string
  recontact_note: string | null
  initiated_by: string | null
  participant_a: string
  participant_b: string
  recommendation_id: string | null
}

type ProfileRow = {
  id: string
  full_name: string | null
  email: string | null
}

function profileSummary(profile: ProfileRow | undefined, fallbackId: string) {
  return {
    id: fallbackId,
    name: profile ? memberDisplayName(profile) : 'Member',
    email: profile?.email ?? null,
  }
}

export async function loadRecontactReviewQueue(
  supabase: SupabaseClient<Database>
): Promise<{ items: RecontactQueueItem[]; error: string | null }> {
  const { data: rows, error } = await supabase
    .from('member_conversations')
    .select(
      'id, status, recontact_status, recontact_requested_at, recontact_note, initiated_by, participant_a, participant_b, recommendation_id'
    )
    .eq('recontact_status', 'requested')
    .order('recontact_requested_at', { ascending: true })

  if (error) {
    if (error.code === '42P01') {
      return { items: [], error: null }
    }
    return { items: [], error: error.message }
  }

  const conversations = (rows ?? []) as ConversationRow[]
  if (conversations.length === 0) {
    return { items: [], error: null }
  }

  const profileIds = [
    ...new Set(
      conversations.flatMap((row) => [row.initiated_by, row.participant_a, row.participant_b])
    ),
  ].filter((id): id is string => Boolean(id))

  const profileById = new Map<string, ProfileRow>()
  if (profileIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', profileIds)

    for (const profile of profiles ?? []) {
      profileById.set(profile.id, profile)
    }
  }

  const conversationIds = conversations.map((row) => row.id)
  const firstMessageByConversation = new Map<
    string,
    { body: string; created_at: string }
  >()

  const { data: messages } = await supabase
    .from('member_messages')
    .select('conversation_id, body, created_at')
    .in('conversation_id', conversationIds)
    .eq('is_system', false)
    .order('created_at', { ascending: true })

  for (const message of messages ?? []) {
    if (!firstMessageByConversation.has(message.conversation_id)) {
      firstMessageByConversation.set(message.conversation_id, {
        body: message.body,
        created_at: message.created_at,
      })
    }
  }

  const items: RecontactQueueItem[] = conversations.map((row) => {
    const requesterId = row.initiated_by!
    const recipientId =
      row.participant_a === requesterId ? row.participant_b : row.participant_a
    const firstMessage = firstMessageByConversation.get(row.id)

    return {
      conversationId: row.id,
      status: row.status,
      recontactStatus: row.recontact_status,
      recontactRequestedAt: row.recontact_requested_at,
      recontactNote: row.recontact_note,
      recommendationId: row.recommendation_id,
      requester: profileSummary(profileById.get(requesterId), requesterId),
      recipient: profileSummary(profileById.get(recipientId), recipientId),
      originalMessage: firstMessage?.body ?? null,
      originalMessageAt: firstMessage?.created_at ?? null,
    }
  })

  return { items, error: null }
}
