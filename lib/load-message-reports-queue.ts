import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { memberDisplayName } from '@/lib/members-discovery'
import {
  CONVERSATION_REPORT_REASONS,
  type ConversationReportReason,
} from '@/lib/member-messaging-safety'
import { isMessagingSuspended } from '@/lib/messaging-suspension'

export type MessageReportQueueMessage = {
  senderLabel: string
  body: string
  createdAt: string
  isSystem: boolean
}

export type MessageReportQueueMember = {
  id: string
  name: string
  email: string | null
  messagingSuspended: boolean
}

export type MessageReportQueueItem = {
  id: string
  status: string
  reason: string
  reasonLabel: string
  details: string | null
  createdAt: string
  adminNotes: string | null
  adminReviewedAt: string | null
  conversationId: string
  reporter: MessageReportQueueMember
  reportedMember: MessageReportQueueMember | null
  participants: MessageReportQueueMember[]
  blockState: {
    isBlocked: boolean
    blockedByReporter: boolean
    blockedByReported: boolean
  }
  messagePreview: MessageReportQueueMessage[]
}

type ReportRow = {
  id: string
  status: string
  reason: string
  details: string | null
  created_at: string
  admin_notes: string | null
  admin_reviewed_at: string | null
  reporter_id: string
  reported_member_id: string | null
  conversation_id: string
}

type ProfileRow = {
  id: string
  full_name: string | null
  email: string | null
  messaging_suspended_at: string | null
}

type ConversationRow = {
  id: string
  participant_a: string
  participant_b: string
}

type MessageRow = {
  sender_id: string
  body: string
  created_at: string
  is_system: boolean
}

function reasonLabel(reason: string): string {
  return (
    CONVERSATION_REPORT_REASONS.find((option) => option.value === reason)
      ?.label ?? reason
  )
}

function memberSummary(
  profile: ProfileRow | undefined,
  fallbackId: string
): MessageReportQueueMember {
  return {
    id: fallbackId,
    name: profile ? memberDisplayName(profile) : 'Member',
    email: profile?.email ?? null,
    messagingSuspended: isMessagingSuspended(profile),
  }
}

function sortMessageReportQueueItems(
  items: MessageReportQueueItem[]
): MessageReportQueueItem[] {
  return [...items].sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1
    if (b.status === 'pending' && a.status !== 'pending') return 1
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })
}

const REPORT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function parseFocusReportId(value: string | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed || !REPORT_ID_PATTERN.test(trimmed)) {
    return null
  }
  return trimmed
}

export type MessageReportFocusStatus = 'found' | 'missing' | 'invalid'

async function buildMessageReportQueueItems(
  supabase: SupabaseClient<Database>,
  reportRows: ReportRow[]
): Promise<MessageReportQueueItem[]> {
  if (reportRows.length === 0) {
    return []
  }

  const conversationIds = [
    ...new Set(reportRows.map((row) => row.conversation_id)),
  ]
  const profileIds = new Set<string>()
  for (const row of reportRows) {
    profileIds.add(row.reporter_id)
    if (row.reported_member_id) profileIds.add(row.reported_member_id)
  }

  const { data: conversations } = await supabase
    .from('member_conversations')
    .select('id, participant_a, participant_b')
    .in('id', conversationIds)

  const conversationById = new Map<string, ConversationRow>()
  for (const conversation of conversations ?? []) {
    conversationById.set(conversation.id, conversation)
    profileIds.add(conversation.participant_a)
    profileIds.add(conversation.participant_b)
  }

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, email, messaging_suspended_at')
    .in('id', [...profileIds])

  const profileById = new Map<string, ProfileRow>()
  for (const profile of profiles ?? []) {
    profileById.set(profile.id, profile)
  }

  const { data: blocks } = await supabase
    .from('member_member_blocks')
    .select('blocker_id, blocked_member_id')

  const blockPairs = new Set(
    (blocks ?? []).map((row) => `${row.blocker_id}:${row.blocked_member_id}`)
  )

  const { data: allMessages } = await supabase
    .from('member_messages')
    .select('conversation_id, sender_id, body, created_at, is_system')
    .in('conversation_id', conversationIds)
    .order('created_at', { ascending: false })

  const messagesByConversation = new Map<string, MessageRow[]>()
  for (const message of (allMessages ?? []) as (MessageRow & {
    conversation_id: string
  })[]) {
    const bucket = messagesByConversation.get(message.conversation_id) ?? []
    if (bucket.length < 8) {
      bucket.push(message)
      messagesByConversation.set(message.conversation_id, bucket)
    }
  }

  return reportRows.map((row) => {
    const conversation = conversationById.get(row.conversation_id)
    const participants = conversation
      ? [
          memberSummary(
            profileById.get(conversation.participant_a),
            conversation.participant_a
          ),
          memberSummary(
            profileById.get(conversation.participant_b),
            conversation.participant_b
          ),
        ]
      : []

    const reportedMember = row.reported_member_id
      ? memberSummary(
          profileById.get(row.reported_member_id),
          row.reported_member_id
        )
      : null

    const blockedByReporter = row.reported_member_id
      ? blockPairs.has(`${row.reporter_id}:${row.reported_member_id}`)
      : false
    const blockedByReported = row.reported_member_id
      ? blockPairs.has(`${row.reported_member_id}:${row.reporter_id}`)
      : false

    const previewMessages = (
      messagesByConversation.get(row.conversation_id) ?? []
    )
      .slice()
      .reverse()
      .map((message) => ({
        senderLabel: message.is_system
          ? 'Huntsville Social Club'
          : memberSummary(profileById.get(message.sender_id), message.sender_id)
              .name,
        body: message.body,
        createdAt: message.created_at,
        isSystem: message.is_system,
      }))

    return {
      id: row.id,
      status: row.status,
      reason: row.reason,
      reasonLabel: reasonLabel(row.reason),
      details: row.details,
      createdAt: row.created_at,
      adminNotes: row.admin_notes,
      adminReviewedAt: row.admin_reviewed_at,
      conversationId: row.conversation_id,
      reporter: memberSummary(profileById.get(row.reporter_id), row.reporter_id),
      reportedMember,
      participants,
      blockState: {
        isBlocked: blockedByReporter || blockedByReported,
        blockedByReporter,
        blockedByReported,
      },
      messagePreview: previewMessages,
    }
  })
}

const REPORT_SELECT =
  'id, status, reason, details, created_at, admin_notes, admin_reviewed_at, reporter_id, reported_member_id, conversation_id'

export async function loadMessageReportQueue(
  supabase: SupabaseClient<Database>,
  options: { focusReportId?: string | null } = {}
): Promise<{
  items: MessageReportQueueItem[]
  error: string | null
  focusReportId: string | null
  focusStatus: MessageReportFocusStatus | null
}> {
  const focusReportId = options.focusReportId ?? null

  const { data: rows, error } = await supabase
    .from('member_conversation_reports')
    .select(REPORT_SELECT)
    .order('created_at', { ascending: true })

  if (error) {
    if (error.code === '42P01') {
      return {
        items: [],
        error: null,
        focusReportId,
        focusStatus: focusReportId ? 'missing' : null,
      }
    }
    return {
      items: [],
      error: error.message,
      focusReportId,
      focusStatus: focusReportId ? 'missing' : null,
    }
  }

  let reportRows = (rows ?? []) as ReportRow[]
  let focusStatus: MessageReportFocusStatus | null = null

  if (focusReportId) {
    const inQueue = reportRows.some((row) => row.id === focusReportId)
    if (inQueue) {
      focusStatus = 'found'
    } else {
      const { data: focusedRow, error: focusError } = await supabase
        .from('member_conversation_reports')
        .select(REPORT_SELECT)
        .eq('id', focusReportId)
        .maybeSingle()

      if (focusError && focusError.code !== '42P01') {
        return {
          items: [],
          error: focusError.message,
          focusReportId,
          focusStatus: 'missing',
        }
      }

      if (focusedRow) {
        reportRows = [...reportRows, focusedRow as ReportRow]
        focusStatus = 'found'
      } else {
        focusStatus = 'missing'
      }
    }
  }

  const items = sortMessageReportQueueItems(
    await buildMessageReportQueueItems(supabase, reportRows)
  )

  return { items, error: null, focusReportId, focusStatus }
}

export function isConversationReportReason(
  value: string
): value is ConversationReportReason {
  return CONVERSATION_REPORT_REASONS.some((option) => option.value === value)
}
