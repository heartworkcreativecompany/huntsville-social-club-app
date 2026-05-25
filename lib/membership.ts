export type MembershipStatus = 'approved' | 'applicant' | 'pending'

type ProfileLike = {
  membership_status?: string | null
  full_name?: string | null
  role?: string | null
} | null

export function resolveMembershipStatus(profile: ProfileLike): MembershipStatus {
  const raw = profile?.membership_status
  if (raw === 'approved' || raw === 'pending' || raw === 'applicant') {
    return raw
  }

  if (profile?.role === 'admin' || profile?.role === 'host') {
    return 'approved'
  }

  if (profile?.full_name?.trim()) {
    return 'approved'
  }

  return 'applicant'
}

export function membershipStatusLabel(status: MembershipStatus): string {
  if (status === 'approved') return 'Approved member'
  if (status === 'pending') return 'Pending review'
  return 'Applicant'
}

/** Full app access for events and directory (preserves existing member flows). */
export function canAccessMemberFeatures(
  status: MembershipStatus,
  role: string
): boolean {
  if (role === 'admin' || role === 'host') return true
  return status === 'approved'
}
