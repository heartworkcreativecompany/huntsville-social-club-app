import { describe, expect, it } from 'vitest'
import {
  canAdminPromptRecipientReconsideration,
  canRecipientRespondToRecontact,
  canRequestRecontactReview,
  canSenderRetryAfterRecontact,
  validateMessageRequestCreation,
} from '@/lib/message-recontact-states'

const declinedConversation = {
  status: 'declined' as const,
  recontact_status: null,
  initiated_by: 'sender-1',
}

describe('validateMessageRequestCreation with recontact', () => {
  it('blocks direct retry after first decline', () => {
    expect(
      validateMessageRequestCreation({
        existingStatus: 'declined',
        recontactStatus: null,
      })
    ).toEqual({
      ok: false,
      error:
        'This member declined your message request. Request a recontact review if you would like another chance.',
    })
  })

  it('allows retry only when recipient approved recontact', () => {
    expect(
      validateMessageRequestCreation({
        existingStatus: 'declined',
        recontactStatus: 'allowed',
      })
    ).toEqual({ ok: true, retry: true })
  })

  it('blocks repeat recontact requests while one is in progress', () => {
    expect(
      validateMessageRequestCreation({
        existingStatus: 'declined',
        recontactStatus: 'requested',
      }).ok
    ).toBe(false)
  })

  it('blocks new requests after recontact is denied or consumed', () => {
    expect(
      validateMessageRequestCreation({
        existingStatus: 'declined',
        recontactStatus: 'denied',
      }).ok
    ).toBe(false)

    expect(
      validateMessageRequestCreation({
        existingStatus: 'declined',
        recontactStatus: 'consumed',
      }).ok
    ).toBe(false)
  })
})

describe('recontact permissions', () => {
  it('lets only the original sender request admin review once', () => {
    expect(
      canRequestRecontactReview({
        conversation: declinedConversation,
        viewerId: 'sender-1',
      })
    ).toBe(true)

    expect(
      canRequestRecontactReview({
        conversation: declinedConversation,
        viewerId: 'recipient-1',
      })
    ).toBe(false)

    expect(
      canRequestRecontactReview({
        conversation: {
          ...declinedConversation,
          recontact_status: 'requested',
        },
        viewerId: 'sender-1',
      })
    ).toBe(false)
  })

  it('requires admin queue state before recipient reconsideration', () => {
    expect(
      canAdminPromptRecipientReconsideration({ recontactStatus: 'requested' })
    ).toBe(true)
    expect(
      canAdminPromptRecipientReconsideration({ recontactStatus: null })
    ).toBe(false)
  })

  it('lets only the recipient respond during reconsideration', () => {
    expect(
      canRecipientRespondToRecontact({ recontactStatus: 'awaiting_recipient' })
    ).toBe(true)
    expect(
      canRecipientRespondToRecontact({ recontactStatus: 'requested' })
    ).toBe(false)
  })

  it('lets sender retry only after recipient allows recontact', () => {
    expect(
      canSenderRetryAfterRecontact({
        conversation: {
          ...declinedConversation,
          recontact_status: 'allowed',
        },
        viewerId: 'sender-1',
      })
    ).toBe(true)

    expect(
      canSenderRetryAfterRecontact({
        conversation: {
          ...declinedConversation,
          recontact_status: 'awaiting_recipient',
        },
        viewerId: 'sender-1',
      })
    ).toBe(false)
  })
})
