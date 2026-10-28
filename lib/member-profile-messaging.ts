import type { AcceptedIdentityStatus } from '@/lib/identity-verification'
import {
  IDENTITY_LOOKUP_UNAVAILABLE_MESSAGE,
  IDENTITY_REQUIRED_BEFORE_MESSAGING,
} from '@/lib/identity-verification'
import { MUTUAL_MESSAGING_REQUIRED_MESSAGE } from '@/lib/membership-entitlements'

/**
 * Canonical in-app upgrade path for messaging entitlement.
 * Prefer `/upgrade` (authenticated plans) over marketing `/pricing`.
 */
export const MEMBER_MESSAGING_UPGRADE_PATH = '/upgrade' as const

export const MEMBER_MESSAGING_LOCKED_COPY =
  'Messaging is available with a paid membership.' as const

export const MEMBER_MESSAGING_UPGRADE_CTA = 'Upgrade membership' as const

/** Neutral notice when the viewer is paid but a new request is not mutually eligible. */
export const MEMBER_MESSAGING_MUTUAL_REQUIRED_COPY =
  MUTUAL_MESSAGING_REQUIRED_MESSAGE

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

export type ProfileMessagingUiMode =
  | 'hidden'
  | 'composer'
  | 'identity_required'
  | 'identity_unavailable'
  | 'unavailable'

export function profileMessagingUiMode(input: {
  isSelf: boolean
  senderIdentity: AcceptedIdentityStatus
  recipientIdentity: AcceptedIdentityStatus
}): ProfileMessagingUiMode {
  if (input.isSelf) return 'hidden'
  if (
    input.senderIdentity === 'unavailable' ||
    input.recipientIdentity === 'unavailable'
  ) {
    return 'identity_unavailable'
  }
  if (input.senderIdentity !== 'verified') return 'identity_required'
  if (input.recipientIdentity !== 'verified') return 'unavailable'
  return 'composer'
}

export const PROFILE_IDENTITY_REQUIRED_COPY = IDENTITY_REQUIRED_BEFORE_MESSAGING
export const PROFILE_IDENTITY_UNAVAILABLE_COPY = IDENTITY_LOOKUP_UNAVAILABLE_MESSAGE
