'use client'

import { requestMemberIntro } from '@/app/(club)/members/intro-actions'
import MemberProfileMessageForm from '@/components/members/member-profile-message-form'

/**
 * Profile-page messaging panel. Recipient id is always the prop from the
 * route/profile record — never a user-editable form field.
 */
export default function MemberProfileMessagePanel({
  targetMemberId,
  firstName,
  canMessage,
  isSelf = false,
}: {
  targetMemberId: string
  firstName: string
  canMessage: boolean
  isSelf?: boolean
}) {
  return (
    <MemberProfileMessageForm
      firstName={firstName}
      canMessage={canMessage}
      isSelf={isSelf}
      onSend={(body) => requestMemberIntro(targetMemberId, body)}
    />
  )
}
