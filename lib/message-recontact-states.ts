import type { ConversationStatus } from '@/lib/message-request-states'

export const RECONTACT_STATUSES = [
  'requested',
  'awaiting_recipient',
  'allowed',
  'denied',
  'consumed',
] as const

export type RecontactStatus = (typeof RECONTACT_STATUSES)[number]

export type ConversationRecontactFields = {
  status: ConversationStatus
  recontact_status: RecontactStatus | null
  initiated_by: string | null
}

export function canRequestRecontactReview(input: {
  conversation: ConversationRecontactFields
  viewerId: string
}): boolean {
  return (
    input.conversation.status === 'declined' &&
    input.conversation.recontact_status == null &&
    input.conversation.initiated_by === input.viewerId
  )
}

export function canAdminPromptRecipientReconsideration(input: {
  recontactStatus: RecontactStatus | null
}): boolean {
  return input.recontactStatus === 'requested'
}

export function canRecipientRespondToRecontact(input: {
  recontactStatus: RecontactStatus | null
}): boolean {
  return input.recontactStatus === 'awaiting_recipient'
}

export function canSenderRetryAfterRecontact(input: {
  conversation: ConversationRecontactFields
  viewerId: string
}): boolean {
  return (
    input.conversation.status === 'declined' &&
    input.conversation.recontact_status === 'allowed' &&
    input.conversation.initiated_by === input.viewerId
  )
}

export function recontactStateLabel(input: {
  recontactStatus: RecontactStatus | null
  viewerIsInitiator: boolean
}): string | null {
  switch (input.recontactStatus) {
    case 'requested':
      return input.viewerIsInitiator
        ? 'Recontact review requested'
        : null
    case 'awaiting_recipient':
      return input.viewerIsInitiator
        ? 'Waiting for admin and recipient review'
        : 'Allow one more message?'
    case 'allowed':
      return input.viewerIsInitiator
        ? 'You may send one more message request'
        : 'You allowed one more message attempt'
    case 'denied':
      return input.viewerIsInitiator
        ? 'Recontact not allowed'
        : 'You declined recontact'
    case 'consumed':
      return input.viewerIsInitiator
        ? 'Second attempt used'
        : null
    default:
      return null
  }
}

export function validateMessageRequestCreation(input: {
  existingStatus: ConversationStatus | null
  recontactStatus?: RecontactStatus | null
}): { ok: true; retry?: boolean } | { ok: false; error: string } {
  if (!input.existingStatus) {
    return { ok: true }
  }

  if (input.existingStatus === 'pending') {
    return {
      ok: false,
      error: 'A message request is already pending with this member.',
    }
  }

  if (input.existingStatus === 'accepted') {
    return {
      ok: false,
      error: 'You already have an active conversation with this member.',
    }
  }

  if (input.existingStatus === 'declined') {
    if (input.recontactStatus === 'allowed') {
      return { ok: true, retry: true }
    }

    if (input.recontactStatus === 'requested') {
      return {
        ok: false,
        error:
          'A recontact review is already in progress. We will notify you of the outcome.',
      }
    }

    if (input.recontactStatus === 'awaiting_recipient') {
      return {
        ok: false,
        error:
          'The recipient is being asked whether to allow another message. Please wait for their response.',
      }
    }

    if (input.recontactStatus === 'denied' || input.recontactStatus === 'consumed') {
      return {
        ok: false,
        error:
          'This member is not available for another message request at this time.',
      }
    }

    return {
      ok: false,
      error:
        'This member declined your message request. Request a recontact review if you would like another chance.',
    }
  }

  return { ok: false, error: 'Unable to send a message request right now.' }
}
