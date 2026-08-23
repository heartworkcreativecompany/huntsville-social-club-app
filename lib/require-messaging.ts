import { createClient } from '@/lib/supabase/server'
import { isCuratedIntroConversationForMember } from '@/lib/curated-intro-messaging-access'
import {
  buildMemberEntitlementsWithOverride,
  loadMemberEntitlementsForUserId,
} from '@/lib/load-member-entitlements'
import {
  canStartMessageRequest,
  canUseMessaging,
  messagingUpgradeMessage,
  MUTUAL_MESSAGING_REQUIRED_MESSAGE,
  type MemberEntitlements,
} from '@/lib/membership-entitlements'
import {
  isMessagingSuspended,
  MESSAGING_SUSPENDED_SEND_ERROR,
} from '@/lib/messaging-suspension'
import { createAdminClient } from '@/lib/supabase/admin'
import { getViewer } from '@/lib/viewer'

async function loadViewerMessagingEntitlements(): Promise<
  | {
      ok: true
      userId: string
      entitlements: MemberEntitlements
    }
  | { ok: false; error: string }
> {
  const viewer = await getViewer()
  if (!viewer) {
    return { ok: false, error: 'You must be signed in.' }
  }

  if (!viewer.canAccessApp) {
    return { ok: false, error: 'Membership approval is required.' }
  }

  if (isMessagingSuspended(viewer.profile)) {
    return { ok: false, error: MESSAGING_SUSPENDED_SEND_ERROR }
  }

  const entitlements =
    (await loadMemberEntitlementsForUserId(viewer.userId)) ??
    (await buildMemberEntitlementsWithOverride({
      userId: viewer.userId,
      role: viewer.role,
      billing: viewer.profile?.membership_billing,
      applicationApproved: true,
    }))

  return { ok: true, userId: viewer.userId, entitlements }
}

/**
 * Sender messaging gate for conversation activity (including replies).
 * Existing conversation reply permissions are unchanged — see
 * `canSendMessageInConversation` and the conversationId exception below.
 */
export async function assertMessagingAllowed(options?: {
  conversationId?: string
}): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: string }
> {
  const loaded = await loadViewerMessagingEntitlements()
  if (!loaded.ok) {
    return loaded
  }

  const { userId, entitlements } = loaded
  const supabase = await createClient()

  if (!canUseMessaging(entitlements)) {
    if (options?.conversationId) {
      const { isMessageRequestConversationForMember } = await import(
        '@/lib/curated-intro-messaging-access'
      )
      const [isIntroConversation, isRequestConversation] = await Promise.all([
        isCuratedIntroConversationForMember(
          supabase,
          userId,
          options.conversationId
        ),
        isMessageRequestConversationForMember(
          supabase,
          userId,
          options.conversationId
        ),
      ])

      if (isIntroConversation || isRequestConversation) {
        return { ok: true, userId }
      }
    }

    return {
      ok: false,
      error: messagingUpgradeMessage(entitlements.productTier),
    }
  }

  return { ok: true, userId }
}

/**
 * New message-request gate: sender and recipient must both have paid messaging.
 * Uses a generic error that does not disclose which party failed.
 */
export async function assertCanStartMessageRequest(input: {
  targetMemberId: string
}): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: string }
> {
  const loaded = await loadViewerMessagingEntitlements()
  if (!loaded.ok) {
    return loaded
  }

  const { userId, entitlements: senderEntitlements } = loaded

  if (!canUseMessaging(senderEntitlements)) {
    return {
      ok: false,
      error: messagingUpgradeMessage(senderEntitlements.productTier),
    }
  }

  if (userId === input.targetMemberId) {
    return { ok: false, error: MUTUAL_MESSAGING_REQUIRED_MESSAGE }
  }

  const privileged = createAdminClient()
  const client = privileged ?? (await createClient())
  const recipientEntitlements = await loadMemberEntitlementsForUserId(
    input.targetMemberId,
    client
  )

  if (
    !recipientEntitlements ||
    !canStartMessageRequest({
      senderEntitlements,
      recipientEntitlements,
      senderId: userId,
      recipientId: input.targetMemberId,
    })
  ) {
    return { ok: false, error: MUTUAL_MESSAGING_REQUIRED_MESSAGE }
  }

  return { ok: true, userId }
}
