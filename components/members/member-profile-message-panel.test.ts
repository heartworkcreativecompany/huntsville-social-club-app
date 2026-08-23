import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import MemberProfileMessageForm from '@/components/members/member-profile-message-form'
import {
  MEMBER_MESSAGING_LOCKED_COPY,
  MEMBER_MESSAGING_MUTUAL_REQUIRED_COPY,
  MEMBER_MESSAGING_UPGRADE_CTA,
  MEMBER_MESSAGING_UPGRADE_PATH,
} from '@/lib/member-profile-messaging'

describe('MemberProfileMessageForm', () => {
  it('shows composer for paid sender + paid recipient', () => {
    const html = renderToStaticMarkup(
      createElement(MemberProfileMessageForm, {
        firstName: 'Jordan',
        senderCanMessage: true,
        recipientCanMessage: true,
        isSelf: false,
        onSend: async () => ({ success: true as const }),
      })
    )

    expect(html).toContain('Message Jordan')
    expect(html).toContain('<textarea')
    expect(html).toMatch(/Send message request|Sending/)
    expect(html).not.toContain(MEMBER_MESSAGING_LOCKED_COPY)
    expect(html).not.toContain(MEMBER_MESSAGING_MUTUAL_REQUIRED_COPY)
    expect(html).not.toContain(MEMBER_MESSAGING_UPGRADE_PATH)
    expect(html).not.toContain('name="targetMemberId"')
  })

  it('shows neutral notice for paid sender + ineligible recipient (no composer)', () => {
    const html = renderToStaticMarkup(
      createElement(MemberProfileMessageForm, {
        firstName: 'Jordan',
        senderCanMessage: true,
        recipientCanMessage: false,
        isSelf: false,
        onSend: async () => ({ success: true as const }),
      })
    )

    expect(html).toContain(MEMBER_MESSAGING_MUTUAL_REQUIRED_COPY)
    expect(html).not.toContain('<textarea')
    expect(html).not.toContain('Send message request')
    expect(html).not.toContain(MEMBER_MESSAGING_UPGRADE_PATH)
    expect(html).not.toContain(MEMBER_MESSAGING_UPGRADE_CTA)
    expect(html).not.toMatch(/free|subscription|billing|stripe|inner circle|elite/i)
  })

  it('shows upgrade lock for free sender + paid recipient', () => {
    const html = renderToStaticMarkup(
      createElement(MemberProfileMessageForm, {
        firstName: 'Jordan',
        senderCanMessage: false,
        recipientCanMessage: true,
        isSelf: false,
        onSend: async () => ({ success: true as const }),
      })
    )

    expect(html).toContain(MEMBER_MESSAGING_LOCKED_COPY)
    expect(html).toContain(MEMBER_MESSAGING_UPGRADE_CTA)
    expect(html).toContain(`href="${MEMBER_MESSAGING_UPGRADE_PATH}"`)
    expect(html).not.toContain('<textarea')
    expect(html).not.toContain(MEMBER_MESSAGING_MUTUAL_REQUIRED_COPY)
  })

  it('shows upgrade lock for free sender + ineligible recipient', () => {
    const html = renderToStaticMarkup(
      createElement(MemberProfileMessageForm, {
        firstName: 'Jordan',
        senderCanMessage: false,
        recipientCanMessage: false,
        isSelf: false,
        onSend: async () => ({ success: true as const }),
      })
    )

    expect(html).toContain(MEMBER_MESSAGING_LOCKED_COPY)
    expect(html).toContain(`href="${MEMBER_MESSAGING_UPGRADE_PATH}"`)
    expect(html).not.toContain('<textarea')
    expect(html).not.toContain(MEMBER_MESSAGING_MUTUAL_REQUIRED_COPY)
  })

  it('hides messaging UI on self profiles', () => {
    const html = renderToStaticMarkup(
      createElement(MemberProfileMessageForm, {
        firstName: 'Self',
        senderCanMessage: true,
        recipientCanMessage: true,
        isSelf: true,
        onSend: async () => ({ success: true as const }),
      })
    )

    expect(html).toBe('')
  })
})
