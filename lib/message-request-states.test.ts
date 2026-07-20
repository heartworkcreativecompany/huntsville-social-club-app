import { describe, expect, it } from 'vitest'
import {
  canSendMessageInConversation,
  conversationRequestStateLabel,
  isConversationRecipient,
  validateMessageRequestCreation,
} from '@/lib/message-request-states'

describe('validateMessageRequestCreation', () => {
  it('allows a new request when no conversation exists', () => {
    expect(validateMessageRequestCreation({ existingStatus: null })).toEqual({
      ok: true,
    })
  })

  it('blocks duplicate pending requests for the same pair', () => {
    expect(
      validateMessageRequestCreation({ existingStatus: 'pending' })
    ).toEqual({
      ok: false,
      error: 'A message request is already pending with this member.',
    })
  })

  it('blocks requests when a conversation is already active', () => {
    expect(
      validateMessageRequestCreation({ existingStatus: 'accepted' })
    ).toEqual({
      ok: false,
      error: 'You already have an active conversation with this member.',
    })
  })

  it('blocks direct retry after first decline without recontact approval', () => {
    expect(
      validateMessageRequestCreation({ existingStatus: 'declined' })
    ).toEqual({
      ok: false,
      error:
        'This member declined your message request. Request a recontact review if you would like another chance.',
    })
  })
})

describe('canSendMessageInConversation', () => {
  it('allows sends only in accepted conversations', () => {
    expect(canSendMessageInConversation({ status: 'accepted' })).toBe(true)
    expect(canSendMessageInConversation({ status: 'pending' })).toBe(false)
    expect(canSendMessageInConversation({ status: 'declined' })).toBe(false)
  })
})

describe('isConversationRecipient', () => {
  const conversation = {
    participant_a: 'a',
    participant_b: 'b',
    initiated_by: 'a',
    status: 'pending' as const,
  }

  it('identifies the non-initiating participant as recipient', () => {
    expect(isConversationRecipient('b', conversation)).toBe(true)
    expect(isConversationRecipient('a', conversation)).toBe(false)
  })
})

describe('conversationRequestStateLabel', () => {
  it('describes pending states for sender and recipient', () => {
    expect(
      conversationRequestStateLabel({
        status: 'pending',
        viewerIsInitiator: true,
      })
    ).toBe('Waiting for their response')

    expect(
      conversationRequestStateLabel({
        status: 'pending',
        viewerIsInitiator: false,
      })
    ).toBe('Message request — respond below')
  })
})
