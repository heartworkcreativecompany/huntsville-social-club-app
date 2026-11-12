'use server'

import { removedApplicationBlock } from '@/lib/member-removal-db'
import { createAdminClient } from '@/lib/supabase/admin'

export async function checkSignupEmailAllowed(email: string) {
  const message = await removedApplicationBlock(createAdminClient(), email)
  if (message) return { error: message }
  return {}
}
