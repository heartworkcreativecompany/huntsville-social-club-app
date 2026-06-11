import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

/** Service-role client for admin-only operations. Requires SUPABASE_SERVICE_ROLE_KEY. */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    return null
  }

  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
