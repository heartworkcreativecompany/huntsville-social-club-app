export const CONVERSATION_STATUSES = [
  'pending',
  'accepted',
  'declined',
] as const

export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number]

export type ConversationParticipantFields = {
  participant_a: string
  participant_b: string
  initiated_by: string | null
  status: ConversationStatus
}

export function canSendMessageInConversation(input: {
  status: ConversationStatus
}): boolean {
  return input.status === 'accepted'
}

export function isConversationRecipient(
  userId: string,
  conversation: ConversationParticipantFields
): boolean {
  if (!conversation.initiated_by) {
    return false
  }

  if (conversation.initiated_by === userId) {
    return false
  }

  return (
    conversation.participant_a === userId ||
    conversation.participant_b === userId
  )
}

export function isConversationInitiator(
  userId: string,
  conversation: ConversationParticipantFields
): boolean {
  return conversation.initiated_by === userId
}

export function conversationRequestStateLabel(input: {
  status: ConversationStatus
  viewerIsInitiator: boolean
}): string {
  if (input.status === 'accepted') {
    return 'Active conversation'
  }

  if (input.status === 'declined') {
    return input.viewerIsInitiator
      ? 'Message request declined'
      : 'You declined this request'
  }

  return input.viewerIsInitiator
    ? 'Waiting for their response'
    : 'Message request — respond below'
}

export {
  canRequestRecontactReview,
  canSenderRetryAfterRecontact,
  recontactStateLabel,
  validateMessageRequestCreation,
  type RecontactStatus,
} from '@/lib/message-recontact-states'
