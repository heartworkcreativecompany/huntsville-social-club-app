import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

export type SignupNames = {
  given_name: string | null
  family_name: string | null
}

const EMPTY_SIGNUP_NAMES: SignupNames = {
  given_name: null,
  family_name: null,
}

/**
 * Owner or service-role read of signup names. Missing columns, which exist
 * only after the signup-name migration, leave both names empty.
 */
export async function loadSignupNames(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<SignupNames> {
  const result = await supabase
    .from('profiles')
    .select('given_name, family_name')
    .eq('id', userId)
    .maybeSingle()

  if (result.error || !result.data) return EMPTY_SIGNUP_NAMES

  return {
    given_name: result.data?.given_name ?? null,
    family_name: result.data?.family_name ?? null,
  }
}
