import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

/** Ops-only: load account/login emails from profiles.email via service role. */
export async function loadProfileAccountEmails(
  userIds: string[]
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>()
  if (userIds.length === 0) {
    return map
  }

  const admin = createAdminClient()
  if (!admin) {
    return map
  }

  const { data } = await admin
    .from('profiles')
    .select('id, email')
    .in('id', userIds)

  for (const row of data ?? []) {
    map.set(row.id, row.email)
  }

  return map
}
