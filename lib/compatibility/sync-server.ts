import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  detectDatingConnectionChange,
  detectFriendshipConnectionChange,
} from '@/lib/application-draft-sync'
import { isCompatibilityFeatureEnabled } from '@/lib/compatibility/eligibility'
import { onDatingConnectionAdded, onDatingConnectionRemoved } from '@/lib/compatibility/dating-lifecycle'
import { onFriendshipConnectionAdded } from '@/lib/friendship/friendship-lifecycle'
import { isUsableIntentEventId } from '@/lib/profile-revision'

/**
 * Server-only hook after profiles.connection_intents is persisted.
 * Never call from client components — lifecycle runs via service role.
 *
 * `intentEventId` is passed only from profile-revision approval when the
 * pending revision was submitted with a stable UUID. Application draft/submit
 * callers omit it, so intent-approved notifications are not created there.
 */
export async function runCompatibilityConnectionsLifecycle(
  userId: string,
  previousConnections: string[] | null | undefined,
  nextConnections: string[] | null | undefined,
  intentEventId?: string | null
): Promise<void> {
  const datingChange = detectDatingConnectionChange(
    previousConnections ?? [],
    nextConnections ?? []
  )
  const friendshipChange = detectFriendshipConnectionChange(
    previousConnections ?? [],
    nextConnections ?? []
  )

  if (datingChange.type === 'none' && friendshipChange.type === 'none') return

  const admin = createAdminClient()
  if (!admin) {
    console.error(
      '[compatibility] SUPABASE_SERVICE_ROLE_KEY missing — skipped connections lifecycle for',
      userId
    )
    return
  }

  const eventId = isUsableIntentEventId(intentEventId) ? intentEventId.trim() : undefined

  if (isCompatibilityFeatureEnabled()) {
    if (datingChange.type === 'added') {
      await onDatingConnectionAdded(admin, userId, eventId)
    } else if (datingChange.type === 'removed') {
      await onDatingConnectionRemoved(admin, userId)
    }
  }

  if (friendshipChange.type === 'added') {
    await onFriendshipConnectionAdded(admin, userId, eventId)
  }
}
