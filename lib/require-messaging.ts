import { loadAcceptedIdentityStatus } from '@/lib/identity-verification-access'
import {
  IDENTITY_LOOKUP_UNAVAILABLE_MESSAGE,
  IDENTITY_MUTUAL_MESSAGE,
  IDENTITY_REQUIRED_BEFORE_MESSAGING,
} from '@/lib/identity-verification'
import {
  isMessagingSuspended,
  MESSAGING_SUSPENDED_SEND_ERROR,
} from '@/lib/messaging-suspension'
import { createAdminClient } from '@/lib/supabase/admin'
import { getViewer } from '@/lib/viewer'

async function loadViewerMessagingContext(): Promise<
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

  return { ok: true, userId: viewer.userId }
}

async function identityErrorForSender(
  userId: string
): Promise<string | null> {
  const status = await loadAcceptedIdentityStatus(createAdminClient(), userId)
  if (status === 'unavailable') return IDENTITY_LOOKUP_UNAVAILABLE_MESSAGE
  if (status !== 'verified') return IDENTITY_REQUIRED_BEFORE_MESSAGING
  return null
}

/**
 * Personal messaging gate. Identity evidence is required.
 * Payment, an approved curated intro, an existing conversation, and an
 * admin or founder badge do not grant access.
 * Admin moderation uses the admin queues, not this check.
 */
export async function assertMessagingAllowed(options?: {
  conversationId?: string
}): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: string }
> {
  void options?.conversationId
  const loaded = await loadViewerMessagingContext()
  if (!loaded.ok) {
    return loaded
  }

  const identityError = await identityErrorForSender(loaded.userId)
  if (identityError) {
    return { ok: false, error: identityError }
  }

  return { ok: true, userId: loaded.userId }
}

/**
 * Intentional message requests require accepted identity for both members.
 * Payment is not a substitute. The recipient failure uses a generic error.
 */
export async function assertCanStartMessageRequest(input: {
  targetMemberId: string
}): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: string }
> {
  const loaded = await loadViewerMessagingContext()
  if (!loaded.ok) {
    return loaded
  }

  const { userId } = loaded
  const identityError = await identityErrorForSender(userId)
  if (identityError) {
    return { ok: false, error: identityError }
  }

  if (userId === input.targetMemberId) {
    return { ok: false, error: IDENTITY_MUTUAL_MESSAGE }
  }

  const recipientIdentity = await loadAcceptedIdentityStatus(
    createAdminClient(),
    input.targetMemberId
  )
  if (recipientIdentity === 'unavailable') {
    return { ok: false, error: IDENTITY_LOOKUP_UNAVAILABLE_MESSAGE }
  }
  if (recipientIdentity !== 'verified') {
    return { ok: false, error: IDENTITY_MUTUAL_MESSAGE }
  }

  return { ok: true, userId }
}
