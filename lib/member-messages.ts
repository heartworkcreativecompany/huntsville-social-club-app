import type { SupabaseClient } from '@supabase/supabase-js'
import type { ConversationStatus } from '@/lib/message-request-states'
import type { RecontactStatus } from '@/lib/message-recontact-states'
import type { Database } from '@/lib/database.types'
import { memberDisplayName } from '@/lib/members-discovery'
import { MEMBER_PROFILES_VIEW } from '@/lib/member-profiles-view'
import {
  loadConversationBlockState,
  loadConversationReportState,
  type ConversationBlockState,
  type ConversationReportState,
} from '@/lib/member-messaging-safety'

export type MessagePreview = {
  conversationId: string
  otherUserId: string
  otherUserName: string
  lastMessage: string
  lastMessageAt: string
  unread: boolean
  unreadCount: number
  isEmpty: boolean
  isBlocked: boolean
  status: ConversationStatus
  viewerIsInitiator: boolean
  recontactStatus: RecontactStatus | null
}

export type ThreadMessage = {
  id: string
  body: string
  createdAt: string
  senderId: string
  senderLabel: string
  isOwn: boolean
  isSystem: boolean
  isUnread: boolean
}

export type ConversationThread = {
  conversationId: string
  otherUserId: string
  otherUserName: string
  messages: ThreadMessage[]
  unreadCount: number
  blockState: ConversationBlockState
  reportState: ConversationReportState
  status: ConversationStatus
  viewerIsInitiator: boolean
  recontactStatus: RecontactStatus | null
}

type ConversationRow = {
  id: string
  participant_a: string
  participant_b: string
  updated_at: string
  status: ConversationStatus
  initiated_by: string | null
  recontact_status: RecontactStatus | null
}

type MessageRow = {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  read_at: string | null
  created_at: string
  is_system: boolean
}

type ProfileNameRow = {
  id: string
  full_name: string | null
}

const EMPTY_CONVERSATION_PREVIEW =
  'Message request sent — waiting for a response.'

function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

function profileName(profile: ProfileNameRow | undefined) {
  if (!profile) return 'Member'
  return memberDisplayName(profile)
}

export async function loadRecentMessagePreviews(
  supabase: SupabaseClient<Database>,
  userId: string,
  limit = 5
): Promise<{ previews: MessagePreview[]; error: string | null }> {
  const { data: conversations, error } = await supabase
    .from('member_conversations')
    .select(
      'id, participant_a, participant_b, updated_at, status, initiated_by, recontact_status'
    )
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
    .select(
      'id, conversation_id, sender_id, body, read_at, created_at, is_system'
    )
    .in('conversation_id', conversationIds)
    .order('created_at', { ascending: false })

  const latestByConversation = new Map<string, MessageRow>()
  const unreadCountByConversation = new Map<string, number>()
  for (const message of (messages ?? []) as MessageRow[]) {
    if (!latestByConversation.has(message.conversation_id)) {
      latestByConversation.set(message.conversation_id, message)
    }
    if (message.sender_id !== userId && message.read_at === null) {
      unreadCountByConversation.set(
        message.conversation_id,
        (unreadCountByConversation.get(message.conversation_id) ?? 0) + 1
      )
    }
  }

  const blockPairs = await Promise.all(
    otherUserIds.map((otherUserId) =>
      loadConversationBlockState(supabase, userId, otherUserId)
    )
  )
  const blockStateByOtherId = new Map(
    otherUserIds.map((otherUserId, index) => [otherUserId, blockPairs[index]])
  )

  const { data: profiles } = await supabase
    .from(MEMBER_PROFILES_VIEW)
    .select('id, full_name')
    .in('id', otherUserIds)

  const namesById = new Map<string, string>()
  for (const profile of (profiles ?? []) as ProfileNameRow[]) {
    namesById.set(profile.id, profileName(profile))
  }

  const previews: MessagePreview[] = rows.map((conversation) => {
    const otherUserId =
      conversation.participant_a === userId
        ? conversation.participant_b
        : conversation.participant_a
    const latest = latestByConversation.get(conversation.id)
    const blockState = blockStateByOtherId.get(otherUserId)
    const unreadCount = unreadCountByConversation.get(conversation.id) ?? 0

    const viewerIsInitiator = conversation.initiated_by === userId

    if (!latest) {
      return {
        conversationId: conversation.id,
        otherUserId,
        otherUserName: namesById.get(otherUserId) ?? 'Member',
        lastMessage: blockState?.isBlocked
          ? 'Conversation unavailable'
          : EMPTY_CONVERSATION_PREVIEW,
        lastMessageAt: conversation.updated_at,
        unread: false,
        unreadCount: 0,
        isEmpty: true,
        isBlocked: blockState?.isBlocked ?? false,
        status: conversation.status as ConversationStatus,
        viewerIsInitiator,
        recontactStatus: conversation.recontact_status,
      }
    }

    const previewBody = blockState?.isBlocked
      ? 'Conversation unavailable'
      : conversation.status === 'declined' && viewerIsInitiator
        ? conversation.recontact_status === 'allowed'
          ? 'You may send one more message request'
          : conversation.recontact_status === 'requested'
            ? 'Recontact review in progress'
            : conversation.recontact_status === 'awaiting_recipient'
              ? 'Waiting for recipient reconsideration'
              : conversation.recontact_status === 'denied' ||
                  conversation.recontact_status === 'consumed'
                ? 'Recontact not available'
                : `${namesById.get(otherUserId) ?? 'They'} declined your message`
        : conversation.status === 'pending' && viewerIsInitiator
          ? `Waiting for ${namesById.get(otherUserId) ?? 'them'} to respond`
          : conversation.recontact_status === 'awaiting_recipient' &&
              !viewerIsInitiator
            ? 'Allow one more message?'
            : latest.body

    return {
      conversationId: conversation.id,
      otherUserId,
      otherUserName: namesById.get(otherUserId) ?? 'Member',
      lastMessage: previewBody,
      lastMessageAt: latest.created_at,
      unread: unreadCount > 0,
      unreadCount,
      isEmpty: false,
      isBlocked: blockState?.isBlocked ?? false,
      status: conversation.status as ConversationStatus,
      viewerIsInitiator,
      recontactStatus: conversation.recontact_status,
    }
  })

  return { previews, error: null }
}

export async function loadInboxPreviews(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<{ previews: MessagePreview[]; error: string | null }> {
  return loadRecentMessagePreviews(supabase, userId, 50)
}

export async function loadConversationThread(
  supabase: SupabaseClient<Database>,
  userId: string,
  conversationId: string
): Promise<{ thread: ConversationThread | null; error: string | null }> {
  const { data: conversation, error: conversationError } = await supabase
    .from('member_conversations')
    .select('id, participant_a, participant_b, status, initiated_by, recontact_status')
    .eq('id', conversationId)
    .maybeSingle()

  if (conversationError) {
    return { thread: null, error: conversationError.message }
  }

  if (
    !conversation ||
    (conversation.participant_a !== userId &&
      conversation.participant_b !== userId)
  ) {
    return { thread: null, error: null }
  }

  const otherUserId =
    conversation.participant_a === userId
      ? conversation.participant_b
      : conversation.participant_a

  const [{ data: otherProfile }, { data: messageRows, error: messagesError }] =
    await Promise.all([
      supabase
        .from(MEMBER_PROFILES_VIEW)
        .select('id, full_name')
        .eq('id', otherUserId)
        .maybeSingle(),
      supabase
        .from('member_messages')
        .select(
          'id, sender_id, body, created_at, read_at, is_system'
        )
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true }),
    ])

  if (messagesError) {
    return { thread: null, error: messagesError.message }
  }

  const senderIds = [
    ...new Set((messageRows ?? []).map((row) => row.sender_id)),
  ]
  const namesById = new Map<string, string>()

  if (senderIds.length > 0) {
    const { data: senders } = await supabase
      .from(MEMBER_PROFILES_VIEW)
      .select('id, full_name')
      .in('id', senderIds)

    for (const sender of senders ?? []) {
      namesById.set(sender.id, profileName(sender))
    }
  }

  const messages: ThreadMessage[] = (messageRows ?? []).map((row) => ({
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    senderId: row.sender_id,
    senderLabel: row.is_system
      ? 'Huntsville Social Club'
      : namesById.get(row.sender_id) ?? 'Member',
    isOwn: row.sender_id === userId && !row.is_system,
    isSystem: row.is_system,
    isUnread: row.sender_id !== userId && row.read_at === null,
  }))

  const unreadCount = messages.filter((message) => message.isUnread).length
  const [blockState, reportState] = await Promise.all([
    loadConversationBlockState(supabase, userId, otherUserId),
    loadConversationReportState(supabase, userId, conversationId),
  ])

  const viewerIsInitiator = conversation.initiated_by === userId

  return {
    thread: {
      conversationId,
      otherUserId,
      otherUserName: profileName(otherProfile ?? undefined),
      messages,
      unreadCount,
      blockState,
      reportState,
      status: conversation.status as ConversationStatus,
      viewerIsInitiator,
      recontactStatus: conversation.recontact_status as RecontactStatus | null,
    },
    error: null,
  }
}

export async function markConversationMessagesRead(
  supabase: SupabaseClient<Database>,
  userId: string,
  conversationId: string
): Promise<void> {
  const now = new Date().toISOString()
  await supabase
    .from('member_messages')
    .update({ read_at: now })
    .eq('conversation_id', conversationId)
    .neq('sender_id', userId)
    .is('read_at', null)
}

export { orderedPair, EMPTY_CONVERSATION_PREVIEW }
