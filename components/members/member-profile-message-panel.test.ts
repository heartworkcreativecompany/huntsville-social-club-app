import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import MemberProfileMessageForm from '@/components/members/member-profile-message-form'
import {
  MEMBER_MESSAGING_LOCKED_COPY,
  MEMBER_MESSAGING_UPGRADE_CTA,
  MEMBER_MESSAGING_UPGRADE_PATH,
} from '@/lib/member-profile-messaging'

describe('MemberProfileMessageForm', () => {
  it('shows composer for eligible paid members', () => {
    const html = renderToStaticMarkup(
      createElement(MemberProfileMessageForm, {
        firstName: 'Jordan',
        canMessage: true,
        isSelf: false,
        onSend: async () => ({ success: true as const }),
      })
    )

    expect(html).toContain('Message Jordan')
    expect(html).toContain('Write a message to Jordan')
    expect(html).toContain('Send message request')
    expect(html).toContain('<textarea')
    expect(html).not.toContain(MEMBER_MESSAGING_LOCKED_COPY)
    expect(html).not.toContain(MEMBER_MESSAGING_UPGRADE_PATH)
    expect(html).not.toContain('name="targetMemberId"')
    expect(html).not.toContain('name="target_member_id"')
  })

  it('shows upgrade lock for free members with no active composer', () => {
    const html = renderToStaticMarkup(
      createElement(MemberProfileMessageForm, {
        firstName: 'Jordan',
        canMessage: false,
        isSelf: false,
        onSend: async () => ({ success: true as const }),
      })
    )

    expect(html).toContain(MEMBER_MESSAGING_LOCKED_COPY)
    expect(html).toContain(MEMBER_MESSAGING_UPGRADE_CTA)
    expect(html).toContain(`href="${MEMBER_MESSAGING_UPGRADE_PATH}"`)
    expect(html).not.toContain('<textarea')
    expect(html).not.toContain('Send message request')
  })

  it('hides messaging UI on self profiles', () => {
    const html = renderToStaticMarkup(
      createElement(MemberProfileMessageForm, {
        firstName: 'Self',
        canMessage: true,
        isSelf: true,
        onSend: async () => ({ success: true as const }),
      })
    )

    expect(html).toBe('')
  })
})
