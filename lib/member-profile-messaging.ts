/**
 * Canonical in-app upgrade path for messaging entitlement.
 * Prefer `/upgrade` (authenticated plans) over marketing `/pricing`.
 */
export const MEMBER_MESSAGING_UPGRADE_PATH = '/upgrade' as const

export const MEMBER_MESSAGING_LOCKED_COPY =
  'Messaging is available with a paid membership.' as const

export const MEMBER_MESSAGING_UPGRADE_CTA = 'Upgrade membership' as const

/** First token of display name for “Message [First name]” headings. */
export function memberFirstNameForMessaging(
  fullName: string | null | undefined
): string {
  const trimmed = fullName?.trim()
  if (!trimmed) return 'Member'
  return trimmed.split(/\s+/)[0] ?? 'Member'
}

/**
 * Recipient for a profile-page message request must come from the route /
 * loaded profile record — never from editable form fields.
 */
export function resolveProfileMessageRecipientId(routeMemberId: string): string {
  return routeMemberId
}

export type ProfileMessagingUiMode = 'hidden' | 'composer' | 'upgrade'

export function profileMessagingUiMode(input: {
  isSelf: boolean
  canMessage: boolean
}): ProfileMessagingUiMode {
  if (input.isSelf) return 'hidden'
  if (input.canMessage) return 'composer'
  return 'upgrade'
}
