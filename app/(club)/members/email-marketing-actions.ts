'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

/** Withdraw marketing email only. This cannot opt a member in. */
export async function withdrawEmailMarketing() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in.' }
  }

  const { error } = await supabase.rpc('withdraw_email_marketing')
  if (error) {
    return { error: 'Could not save your email preference.' }
  }

  revalidatePath('/profile')
  return { success: true as const }
}
