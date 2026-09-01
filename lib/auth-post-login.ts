import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { MEMBER_PROFILES_VIEW } from '@/lib/member-profiles-view'
import {
  isApprovedMember,
  resolveApplicationStatus,
} from '@/lib/application'

/** Where to send the member after a successful password sign-in. */
export async function postLoginPath(
  supabase: SupabaseClient<Database>
): Promise<'/dashboard' | '/application'> {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return '/dashboard'

  let profile: {
    application_status?: string | null
    role?: string | null
    full_name?: string | null
  } | null = null

  const extended = await supabase
    .from(MEMBER_PROFILES_VIEW)
    .select('application_status, role, full_name')
    .eq('id', user.id)
    .maybeSingle()

  if (!extended.error) {
    profile = extended.data
  } else {
    const basic = await supabase
      .from(MEMBER_PROFILES_VIEW)
      .select('role, full_name')
      .eq('id', user.id)
      .maybeSingle()
    profile = basic.data
  }

  const status = resolveApplicationStatus(profile)
  const role = profile?.role ?? 'member'

  return isApprovedMember(status, role) ? '/dashboard' : '/application'
}
