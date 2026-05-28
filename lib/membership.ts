import {
  applicationStatusLabel,
  isApprovedMember,
  resolveApplicationStatus,
  type ApplicationStatus,
} from '@/lib/application'

/** @deprecated Use ApplicationStatus — kept for gradual UI migration */
export type MembershipStatus = 'approved' | 'applicant' | 'pending'

type ProfileLike = {
  application_status?: string | null
  membership_status?: string | null
  full_name?: string | null
  role?: string | null
} | null

export function resolveMembershipStatus(profile: ProfileLike): MembershipStatus {
  const applicationStatus = resolveApplicationStatus(profile)

  if (isApprovedMember(applicationStatus, profile?.role ?? 'member')) {
    return 'approved'
  }

  if (
    applicationStatus === 'submitted' ||
    applicationStatus === 'in_review'
  ) {
    return 'pending'
  }

  return 'applicant'
}

export function membershipStatusLabel(status: MembershipStatus): string {
  if (status === 'approved') return 'Approved member'
  if (status === 'pending') return 'Pending review'
  return 'Applicant'
}

export function canAccessMemberFeatures(
  profile: ProfileLike,
  role: string
): boolean {
  const applicationStatus = resolveApplicationStatus(profile)
  return isApprovedMember(applicationStatus, role)
}

export function getApplicationStatus(profile: ProfileLike): ApplicationStatus {
  return resolveApplicationStatus(profile)
}

export { applicationStatusLabel, type ApplicationStatus }
