import { createClient } from '@/lib/supabase/server'
import { isCuratedIntroConversationForMember } from '@/lib/curated-intro-messaging-access'
import { loadActiveEntitlementCycle } from '@/lib/membership-billing-cycles'
import {
  buildMemberEntitlements,
  canUseMessaging,
  messagingUpgradeMessage,
} from '@/lib/membership-entitlements'
import {
  isMessagingSuspended,
  MESSAGING_SUSPENDED_SEND_ERROR,
} from '@/lib/messaging-suspension'
import { getViewer } from '@/lib/viewer'

export async function assertMessagingAllowed(options?: {
  conversationId?: string
}): Promise<
  | { ok: true; userId: string }
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

  const supabase = await createClient()
  const activeCycle = await loadActiveEntitlementCycle(supabase, viewer.userId)
  const entitlements = buildMemberEntitlements({
    role: viewer.role,
    billing: viewer.profile?.membership_billing,
    applicationApproved: true,
    activeCycle,
  })

  if (!canUseMessaging(entitlements)) {
    if (options?.conversationId) {
      const { isMessageRequestConversationForMember } = await import(
        '@/lib/curated-intro-messaging-access'
      )
      const [isIntroConversation, isRequestConversation] = await Promise.all([
        isCuratedIntroConversationForMember(
          supabase,
          viewer.userId,
          options.conversationId
        ),
        isMessageRequestConversationForMember(
          supabase,
          viewer.userId,
          options.conversationId
        ),
      ])

      if (isIntroConversation || isRequestConversation) {
        return { ok: true, userId: viewer.userId }
      }
    }

    return {
      ok: false,
      error: messagingUpgradeMessage(entitlements.productTier),
    }
  }

  return { ok: true, userId: viewer.userId }
}
