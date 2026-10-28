'use client'

import { requestMemberIntro } from '@/app/(club)/members/intro-actions'
import MemberProfileMessageForm from '@/components/members/member-profile-message-form'
import type { AcceptedIdentityStatus } from '@/lib/identity-verification'

/**
 * Profile-page messaging panel. Recipient id is always the prop from the
 * route/profile record — never a user-editable form field.
 */
export default function MemberProfileMessagePanel({
  targetMemberId,
  firstName,
  senderIdentity,
  recipientIdentity,
  isSelf = false,
}: {
  targetMemberId: string
  firstName: string
  senderIdentity: AcceptedIdentityStatus
  recipientIdentity: AcceptedIdentityStatus
  isSelf?: boolean
}) {
  return (
    <MemberProfileMessageForm
      firstName={firstName}
      senderIdentity={senderIdentity}
      recipientIdentity={recipientIdentity}
      isSelf={isSelf}
      onSend={(body) => requestMemberIntro(targetMemberId, body)}
    />
  )
}
