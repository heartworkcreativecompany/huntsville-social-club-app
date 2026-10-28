import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import MemberProfileMessageForm from '@/components/members/member-profile-message-form'
import {
  MEMBER_MESSAGING_MUTUAL_REQUIRED_COPY,
  MEMBER_MESSAGING_UPGRADE_PATH,
  PROFILE_IDENTITY_REQUIRED_COPY,
  PROFILE_IDENTITY_UNAVAILABLE_COPY,
} from '@/lib/member-profile-messaging'

describe('MemberProfileMessageForm', () => {
  it('shows composer when both members are identity verified', () => {
    const html = renderToStaticMarkup(
      createElement(MemberProfileMessageForm, {
        firstName: 'Jordan',
        senderIdentity: 'verified',
        recipientIdentity: 'verified',
        isSelf: false,
        onSend: async () => ({ success: true as const }),
      })
    )

    expect(html).toContain('Message Jordan')
    expect(html).toContain('<textarea')
    expect(html).toMatch(/Send message request|Sending/)
    expect(html).not.toContain(PROFILE_IDENTITY_REQUIRED_COPY)
    expect(html).not.toContain(MEMBER_MESSAGING_MUTUAL_REQUIRED_COPY)
    expect(html).not.toContain(MEMBER_MESSAGING_UPGRADE_PATH)
    expect(html).not.toContain('name="targetMemberId"')
  })

  it('shows a neutral notice when the recipient is not identity verified', () => {
    const html = renderToStaticMarkup(
      createElement(MemberProfileMessageForm, {
        firstName: 'Jordan',
        senderIdentity: 'verified',
        recipientIdentity: 'unverified',
        isSelf: false,
        onSend: async () => ({ success: true as const }),
      })
    )

    expect(html).toContain(MEMBER_MESSAGING_MUTUAL_REQUIRED_COPY)
    expect(html).not.toContain('<textarea')
    expect(html).not.toContain('Send message request')
    expect(html).not.toContain('/upgrade')
    expect(html).not.toMatch(/free|subscription|billing|stripe|in-person|inner circle|elite/i)
  })

  it('asks an identity-unverified sender to verify, without a paid upgrade', () => {
    const html = renderToStaticMarkup(
      createElement(MemberProfileMessageForm, {
        firstName: 'Jordan',
        senderIdentity: 'unverified',
        recipientIdentity: 'verified',
        isSelf: false,
        onSend: async () => ({ success: true as const }),
      })
    )

    expect(html).toContain(PROFILE_IDENTITY_REQUIRED_COPY)
    expect(html).toContain('/application/status')
    expect(html).not.toContain('<textarea')
    expect(html).not.toContain(MEMBER_MESSAGING_UPGRADE_PATH)
  })

  it('does not describe a failed lookup as unverified', () => {
    const html = renderToStaticMarkup(
      createElement(MemberProfileMessageForm, {
        firstName: 'Jordan',
        senderIdentity: 'unavailable',
        recipientIdentity: 'verified',
        isSelf: false,
        onSend: async () => ({ success: true as const }),
      })
    )

    expect(html).toContain(PROFILE_IDENTITY_UNAVAILABLE_COPY)
    expect(html).not.toContain(PROFILE_IDENTITY_REQUIRED_COPY)
    expect(html).not.toContain('<textarea')
  })

  it('hides messaging UI on self profiles', () => {
    const html = renderToStaticMarkup(
      createElement(MemberProfileMessageForm, {
        firstName: 'Self',
        senderIdentity: 'verified',
        recipientIdentity: 'verified',
        isSelf: true,
        onSend: async () => ({ success: true as const }),
      })
    )

    expect(html).toBe('')
  })
})
