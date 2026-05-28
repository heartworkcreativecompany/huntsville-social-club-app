import { createClient } from '@/lib/supabase/server'
import type { DirectoryMember } from '@/lib/members-discovery'

function toDirectoryMember(
  profile: {
    id: string
    email: string | null
    full_name: string | null
    role: string | null
    created_at: string | null
    application_status?: string | null
    membership_intent?: string | null
    verified_at?: string | null
  }
): DirectoryMember {
  return {
    id: profile.id,
    email: profile.email,
    full_name: profile.full_name,
    role: profile.role,
    created_at: profile.created_at,
    membership_intent: profile.membership_intent ?? null,
    verified_at: profile.verified_at ?? null,
    membership_status: profile.application_status ?? null,
  }
}

function stripForLimitedView(profile: DirectoryMember): DirectoryMember {
  return {
    ...profile,
    email: null,
    membership_intent: null,
  }
}

export async function loadDirectoryProfiles(
  viewerId: string,
  isAdmin: boolean
): Promise<{ members: DirectoryMember[]; error: string | null }> {
  if (!isAdmin) {
    return { members: [], error: null }
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('profiles')
    .select(
      'id, email, full_name, role, created_at, application_status, membership_intent, verified_at'
    )
    .eq('application_status', 'approved')
    .neq('id', viewerId)
    .order('full_name', { ascending: true })

  if (error) {
    return { members: [], error: error.message }
  }

  return {
    members: (data ?? []).map(toDirectoryMember),
    error: null,
  }
}

export async function loadMemberProfile(
  memberId: string,
  viewerId: string,
  isAdmin: boolean
): Promise<{ member: DirectoryMember | null; error: string | null }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('profiles')
    .select(
      'id, email, full_name, role, created_at, application_status, membership_intent, verified_at'
    )
    .eq('id', memberId)
    .single()

  if (error || !data) {
    return { member: null, error: error?.message ?? 'Profile not found' }
  }

  const isSelf = memberId === viewerId
  const isApproved = data.application_status === 'approved'

  if (!isAdmin && !isSelf) {
    return { member: null, error: null }
  }

  if (!isAdmin && isSelf) {
    return { member: toDirectoryMember(data), error: null }
  }

  if (isAdmin && !isApproved && !isSelf) {
    return { member: null, error: null }
  }

  const member = toDirectoryMember(data)

  return {
    member: isAdmin ? member : stripForLimitedView(member),
    error: null,
  }
}
