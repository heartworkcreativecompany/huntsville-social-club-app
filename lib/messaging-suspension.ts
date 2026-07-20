export type MessagingSuspensionProfileFields = {
  messaging_suspended_at?: string | null
}

export function isMessagingSuspended(
  profile: MessagingSuspensionProfileFields | null | undefined
): boolean {
  return profile?.messaging_suspended_at != null
}

export const MESSAGING_SUSPENDED_MEMBER_MESSAGE =
  'Your messaging access is temporarily suspended. You can read earlier conversations, but you cannot send messages or submit reports until staff restores access. Contact support if you have questions.'

export const MESSAGING_SUSPENDED_SEND_ERROR =
  'Your messaging access is temporarily suspended. Contact support if you have questions.'
