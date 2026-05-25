import { createClient } from '@/lib/supabase/server'
import {
  resolveMembershipStatus,
  type MembershipStatus,
} from '@/lib/membership'

export type ViewerProfile = {
  id: string
  email: string | null
  full_name: string | null
  role: string | null
  created_at: string | null
  membership_status?: string | null
  membership_intent?: string | null
  verified_at?: string | null
}

export type Viewer = {
  userId: string
  email: string
  profile: ViewerProfile | null
  role: string
  membershipStatus: MembershipStatus
  canAccessApp: boolean
}

export async function getViewer(): Promise<Viewer | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, created_at')
    .eq('id', user.id)
    .single()

  const role = profile?.role ?? 'member'
  const membershipStatus = resolveMembershipStatus(profile)
  return {
    userId: user.id,
    email: user.email ?? profile?.email ?? '',
    profile,
    role,
    membershipStatus,
    /** Preserves existing access: signed-in members can use events and profile. */
    canAccessApp: true,
  }
}
