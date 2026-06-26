import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { memberDisplayName } from '@/lib/members-discovery'

export type MessagePreview = {
  conversationId: string
  otherUserId: string
  otherUserName: string
  lastMessage: string
  lastMessageAt: string
  unread: boolean
}

type ConversationRow = {
  id: string
  participant_a: string
  participant_b: string
  updated_at: string
}

type MessageRow = {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  read_at: string | null
  created_at: string
}

type ProfileNameRow = {
  id: string
  full_name: string | null
  email: string | null
}

function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

export async function loadRecentMessagePreviews(
  supabase: SupabaseClient<Database>,
  userId: string,
  limit = 5
): Promise<{ previews: MessagePreview[]; error: string | null }> {
  const { data: conversations, error } = await supabase
    .from('member_conversations')
    .select('id, participant_a, participant_b, updated_at')
    .or(`participant_a.eq.${userId},participant_b.eq.${userId}`)
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (error) {
    if (error.code === '42P01') {
      return { previews: [], error: null }
    }
    return { previews: [], error: error.message }
  }

  const rows = (conversations ?? []) as ConversationRow[]
  if (rows.length === 0) {
    return { previews: [], error: null }
  }

  const conversationIds = rows.map((row) => row.id)
  const otherUserIds = rows.map((row) =>
    row.participant_a === userId ? row.participant_b : row.participant_a
  )

  const { data: messages } = await supabase
    .from('member_messages')
    .select('id, conversation_id, sender_id, body, read_at, created_at')
    .in('conversation_id', conversationIds)
    .order('created_at', { ascending: false })

  const latestByConversation = new Map<string, MessageRow>()
  for (const message of (messages ?? []) as MessageRow[]) {
    if (!latestByConversation.has(message.conversation_id)) {
      latestByConversation.set(message.conversation_id, message)
    }
  }

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', otherUserIds)

  const namesById = new Map<string, string>()
  for (const profile of (profiles ?? []) as ProfileNameRow[]) {
    namesById.set(
      profile.id,
      memberDisplayName({
        id: profile.id,
        full_name: profile.full_name,
        email: profile.email,
      } as Parameters<typeof memberDisplayName>[0])
    )
  }

  const previews: MessagePreview[] = rows
    .map((conversation) => {
      const otherUserId =
        conversation.participant_a === userId
          ? conversation.participant_b
          : conversation.participant_a
      const latest = latestByConversation.get(conversation.id)
      if (!latest) return null

      return {
        conversationId: conversation.id,
        otherUserId,
        otherUserName: namesById.get(otherUserId) ?? 'Member',
        lastMessage: latest.body,
        lastMessageAt: latest.created_at,
        unread: latest.sender_id !== userId && latest.read_at === null,
      }
    })
    .filter((preview): preview is MessagePreview => preview !== null)

  return { previews, error: null }
}

export async function loadInboxPreviews(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<{ previews: MessagePreview[]; error: string | null }> {
  return loadRecentMessagePreviews(supabase, userId, 50)
}

export { orderedPair }
