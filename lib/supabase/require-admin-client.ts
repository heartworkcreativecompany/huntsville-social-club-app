import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

export function requireAdminClient() {
  const client = createAdminClient()
  if (!client) {
    throw new Error(
      'Admin database client is unavailable. Set SUPABASE_SERVICE_ROLE_KEY.'
    )
  }
  return client
}
