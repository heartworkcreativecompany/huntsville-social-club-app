'use server'

import { revalidatePath } from 'next/cache'
import { validateMemberMessageBody } from '@/lib/member-message-limits'
import {
  assertConversationParticipant,
  loadConversationBlockState,
  type ConversationReportReason,
} from '@/lib/member-messaging-safety'
import {
  conversationNotificationHref,
  createMemberNotification,
} from '@/lib/member-notifications'
import {
  acceptMessageRequest,
  createMessageRequest,
  declineMessageRequest,
} from '@/lib/message-request-flow'
import {
  notifyMessageRequestAccepted,
  notifyMessageRequestDeclined,
  notifyMessageRequestReceived,
  notifyRecontactAllowed,
  notifyRecontactDeniedFinal,
  notifyRecontactReviewRequested,
} from '@/lib/message-request-notifications'
import {
  requestRecontactReview,
  respondToRecontactPrompt,
  retryMessageRequestAfterRecontact,
} from '@/lib/message-recontact-flow'
import { canSendMessageInConversation } from '@/lib/message-request-states'
import { assertMessagingAllowed } from '@/lib/require-messaging'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

function revalidateConversation(conversationId: string) {
  revalidatePath('/messages')
  revalidatePath(`/messages/${conversationId}`)
  revalidatePath('/members')
  revalidatePath('/matches')
  revalidatePath('/admin/recontact-requests')
}

function adminWriteClient() {
  const admin = createAdminClient()
  if (!admin) {
    return {
      error: 'Messaging service is unavailable. Check SUPABASE_SERVICE_ROLE_KEY.',
      admin: null,
    }
  }
  return { error: null, admin }
}

export async function sendMessageRequest(input: {
  targetMemberId: string
  body: string
  recommendationId?: string
}) {
  const gate = await assertMessagingAllowed()
  if (!gate.ok) {
    return { error: gate.error }
  }

  const client = adminWriteClient()
  if (client.error || !client.admin) {
    return { error: client.error ?? 'Messaging service unavailable.' }
  }

  const result = await createMessageRequest(client.admin, {
    requesterId: gate.userId,
    targetMemberId: input.targetMemberId,
    body: input.body,
    recommendationId: input.recommendationId ?? null,
  })

  if (!result.ok) {
    return { error: result.error }
  }

  await notifyMessageRequestReceived(client.admin, result.result)

  void createMemberNotification(client.admin, {
    userId: gate.userId,
    type: 'curated_intro_requested',
    href: conversationNotificationHref(result.result.conversationId),
    metadata: {
      conversationId: result.result.conversationId,
      recommendationId: result.result.recommendationId,
    },
  })

  revalidateConversation(result.result.conversationId)

  return {
    success: true as const,
    conversationId: result.result.conversationId,
  }
}

export async function acceptMessageRequestAction(conversationId: string) {
  const viewer = await assertMessagingAllowed({ conversationId })
  if (!viewer.ok) {
    return { error: viewer.error }
  }

  const client = adminWriteClient()
  if (client.error || !client.admin) {
    return { error: client.error ?? 'Messaging service unavailable.' }
  }

  const result = await acceptMessageRequest(client.admin, {
    responderId: viewer.userId,
    conversationId,
  })

  if (!result.ok) {
    return { error: result.error }
  }

  await notifyMessageRequestAccepted(client.admin, result.result)
  revalidateConversation(conversationId)

  return { success: true as const }
}

export async function declineMessageRequestAction(conversationId: string) {
  const viewer = await assertMessagingAllowed({ conversationId })
  if (!viewer.ok) {
    return { error: viewer.error }
  }

  const client = adminWriteClient()
  if (client.error || !client.admin) {
    return { error: client.error ?? 'Messaging service unavailable.' }
  }

  const result = await declineMessageRequest(client.admin, {
    responderId: viewer.userId,
    conversationId,
  })

  if (!result.ok) {
    return { error: result.error }
  }

  await notifyMessageRequestDeclined(client.admin, result.result)
  revalidateConversation(conversationId)

  return { success: true as const }
}

export async function requestRecontactReviewAction(input: {
  conversationId: string
  note?: string
}) {
  const viewer = await assertMessagingAllowed({ conversationId: input.conversationId })
  if (!viewer.ok) {
    return { error: viewer.error }
  }

  const client = adminWriteClient()
  if (client.error || !client.admin) {
    return { error: client.error ?? 'Messaging service unavailable.' }
  }

  const result = await requestRecontactReview(client.admin, {
    requesterId: viewer.userId,
    conversationId: input.conversationId,
    note: input.note,
  })

  if (!result.ok) {
    return { error: result.error }
  }

  await notifyRecontactReviewRequested(client.admin, result.result)
  revalidateConversation(input.conversationId)

  return { success: true as const }
}

export async function respondToRecontactPromptAction(input: {
  conversationId: string
  allow: boolean
}) {
  const viewer = await assertMessagingAllowed({ conversationId: input.conversationId })
  if (!viewer.ok) {
    return { error: viewer.error }
  }

  const client = adminWriteClient()
  if (client.error || !client.admin) {
    return { error: client.error ?? 'Messaging service unavailable.' }
  }

  const result = await respondToRecontactPrompt(client.admin, {
    recipientId: viewer.userId,
    conversationId: input.conversationId,
    allow: input.allow,
  })

  if (!result.ok) {
    return { error: result.error }
  }

  if (result.allowed) {
    await notifyRecontactAllowed(client.admin, result.result)
  } else {
    await notifyRecontactDeniedFinal(client.admin, result.result)
  }

  revalidateConversation(input.conversationId)

  return { success: true as const }
}

export async function retryMessageRequestAction(input: {
  conversationId: string
  body: string
}) {
  const viewer = await assertMessagingAllowed({ conversationId: input.conversationId })
  if (!viewer.ok) {
    return { error: viewer.error }
  }

  const client = adminWriteClient()
  if (client.error || !client.admin) {
    return { error: client.error ?? 'Messaging service unavailable.' }
  }

  const result = await retryMessageRequestAfterRecontact(client.admin, {
    requesterId: viewer.userId,
    conversationId: input.conversationId,
    body: input.body,
  })

  if (!result.ok) {
    return { error: result.error }
  }

  await notifyMessageRequestReceived(client.admin, {
    conversationId: result.result.conversationId,
    targetMemberId: result.result.targetMemberId,
    recommendationId: result.result.recommendationId,
  })

  revalidateConversation(input.conversationId)

  return { success: true as const }
}

export async function sendMemberMessage(input: {
  conversationId: string
  body: string
}) {
  const gate = await assertMessagingAllowed({ conversationId: input.conversationId })
  if (!gate.ok) {
    return { error: gate.error }
  }

  const validationError = validateMemberMessageBody(input.body)
  if (validationError) {
    return { error: validationError }
  }

  const body = input.body.trim()
  const supabase = await createClient()

  const { data: conversation, error: conversationError } = await supabase
    .from('member_conversations')
    .select('status, initiated_by')
    .eq('id', input.conversationId)
    .maybeSingle()

  if (conversationError) {
    return { error: conversationError.message }
  }

  if (!conversation) {
    return { error: 'Conversation not found.' }
  }

  if (!canSendMessageInConversation({ status: conversation.status as 'pending' | 'accepted' | 'declined' })) {
    if (conversation.status === 'pending') {
      return {
        error:
          conversation.initiated_by === gate.userId
            ? 'You can send more messages after they accept your request.'
            : 'Accept or decline this message request before replying.',
      }
    }

    return { error: 'This conversation is closed.' }
  }

  const participant = await assertConversationParticipant(
    supabase,
    gate.userId,
    input.conversationId
  )

  if (!participant.ok) {
    return { error: participant.error }
  }

  const blockState = await loadConversationBlockState(
    supabase,
    gate.userId,
    participant.otherMemberId
  )

  if (blockState.isBlocked) {
    return {
      error: blockState.blockedByViewer
        ? 'You blocked this member. Unblock is not available in-app yet — contact support if this was a mistake.'
        : 'This member is unavailable for messaging.',
    }
  }

  const { error } = await supabase.from('member_messages').insert({
    conversation_id: input.conversationId,
    sender_id: gate.userId,
    body,
  })

  if (error) {
    return { error: error.message }
  }

  const admin = createAdminClient()
  if (admin) {
    void createMemberNotification(admin, {
      userId: participant.otherMemberId,
      type: 'new_message',
      href: conversationNotificationHref(input.conversationId),
      metadata: { conversationId: input.conversationId },
    })
  }

  await supabase
    .from('member_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', input.conversationId)

  revalidateConversation(input.conversationId)

  return { success: true as const }
}

export async function blockMemberInConversation(conversationId: string) {
  const gate = await assertMessagingAllowed({ conversationId })
  if (!gate.ok) {
    return { error: gate.error }
  }

  const supabase = await createClient()
  const participant = await assertConversationParticipant(
    supabase,
    gate.userId,
    conversationId
  )

  if (!participant.ok) {
    return { error: participant.error }
  }

  const { error } = await supabase.from('member_member_blocks').insert({
    blocker_id: gate.userId,
    blocked_member_id: participant.otherMemberId,
  })

  if (error) {
    if (error.code === '23505') {
      return { success: true as const, alreadyBlocked: true }
    }
    if (error.code === '42P01') {
      return {
        error:
          'Blocking is not available yet. Run the latest database migration.',
      }
    }
    return { error: error.message }
  }

  revalidateConversation(conversationId)

  return { success: true as const, alreadyBlocked: false }
}

export async function reportConversation(input: {
  conversationId: string
  reason: ConversationReportReason
  details?: string
}) {
  const gate = await assertMessagingAllowed({ conversationId: input.conversationId })
  if (!gate.ok) {
    return { error: gate.error }
  }

  const supabase = await createClient()
  const participant = await assertConversationParticipant(
    supabase,
    gate.userId,
    input.conversationId
  )

  if (!participant.ok) {
    return { error: participant.error }
  }

  const details = input.details?.trim() || null
  if (details && details.length > 1000) {
    return { error: 'Report details must be 1000 characters or fewer.' }
  }

  const { data: existing } = await supabase
    .from('member_conversation_reports')
    .select('id')
    .eq('reporter_id', gate.userId)
    .eq('conversation_id', input.conversationId)
    .eq('status', 'pending')
    .maybeSingle()

  if (existing) {
    return { success: true as const, alreadyReported: true }
  }

  const { error } = await supabase.from('member_conversation_reports').insert({
    reporter_id: gate.userId,
    conversation_id: input.conversationId,
    reported_member_id: participant.otherMemberId,
    reason: input.reason,
    details,
    status: 'pending',
  })

  if (error) {
    if (error.code === '42P01') {
      return {
        error:
          'Reporting is not available yet. Run the latest database migration.',
      }
    }
    return { error: error.message }
  }

  revalidateConversation(input.conversationId)

  return { success: true as const, alreadyReported: false }
}
