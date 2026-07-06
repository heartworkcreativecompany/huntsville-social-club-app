import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { detectDatingConnectionChange } from '@/lib/application-draft-sync'
import { isCompatibilityFeatureEnabled } from '@/lib/compatibility/eligibility'
import { onDatingConnectionAdded, onDatingConnectionRemoved } from '@/lib/compatibility/dating-lifecycle'

/**
 * Server-only hook after profiles.connections_open_to is persisted.
 * Never call from client components — lifecycle runs via service role.
 */
export async function runCompatibilityConnectionsLifecycle(
  userId: string,
  previousConnections: string[] | null | undefined,
  nextConnections: string[] | null | undefined
): Promise<void> {
  if (!isCompatibilityFeatureEnabled()) return

  const change = detectDatingConnectionChange(
    previousConnections ?? [],
    nextConnections ?? []
  )

  if (change.type === 'none') return

  const admin = createAdminClient()
  if (!admin) {
    console.error(
      '[compatibility] SUPABASE_SERVICE_ROLE_KEY missing — skipped connections lifecycle for',
      userId
    )
    return
  }

  if (change.type === 'added') {
    await onDatingConnectionAdded(admin, userId)
    return
  }

  await onDatingConnectionRemoved(admin, userId)
}
