import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { isAdminClientEnvConfigured } from '@/lib/supabase/admin-env'

/** Service-role client for admin-only operations. Requires SUPABASE_SERVICE_ROLE_KEY. */
export function createAdminClient() {
  if (!isAdminClientEnvConfigured()) {
    return null
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!

  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
