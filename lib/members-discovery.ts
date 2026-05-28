import {
  resolveApplicationStatus,
  type ApplicationStatus,
} from '@/lib/application'
import {
  membershipStatusLabel,
  resolveMembershipStatus,
  type MembershipStatus,
} from '@/lib/membership'
import { roleLabel } from '@/lib/event-labels'

export type DirectoryMember = {
  id: string
  email: string | null
  full_name: string | null
  role: string | null
  created_at: string | null
  membership_intent: string | null
  verified_at: string | null
  membership_status: string | null
}

export type TrustBadge = {
  label: string
  variant: 'success' | 'accent' | 'warning' | 'muted'
}

export function memberDisplayName(member: DirectoryMember): string {
  if (member.full_name?.trim()) return member.full_name.trim()
  if (member.email) return member.email
  return 'Member'
}

export function professionalContext(
  role: string | null | undefined,
  limited: boolean
): string {
  if (role === 'host') {
    return 'Hosts curated gatherings and member experiences for the club.'
  }
  if (role === 'admin') {
    return 'Stewards membership standards, programming, and club operations.'
  }
  if (limited) {
    return 'Verified member · Connect in person at club events.'
  }
  return 'Verified member contributing to the Huntsville community.'
}

export function trustBadges(member: DirectoryMember): TrustBadge[] {
  const badges: TrustBadge[] = []
  const status = resolveMembershipStatus(member)

  if (member.verified_at) {
    badges.push({ label: 'Verified member', variant: 'success' })
  } else if (status === 'approved') {
    badges.push({ label: 'Approved', variant: 'success' })
  } else if (status === 'pending') {
    badges.push({ label: 'Pending review', variant: 'warning' })
  } else if (status === 'applicant') {
    badges.push({ label: 'Applicant', variant: 'muted' })
  }

  const role = member.role ?? 'member'
  if (role === 'host') {
    badges.push({ label: 'Host', variant: 'accent' })
  } else if (role === 'admin') {
    badges.push({ label: 'Operations', variant: 'accent' })
  } else {
    badges.push({ label: 'Member', variant: 'muted' })
  }

  return badges
}

export function intentLabel(
  intent: string | null | undefined,
  options?: { placeholder?: string }
): string {
  const trimmed = intent?.trim()
  if (trimmed) return trimmed
  return options?.placeholder ?? 'Intent not shared yet'
}

export function memberSinceLabel(createdAt: string | null | undefined): string | null {
  if (!createdAt) return null
  return `Member since ${new Date(createdAt).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })}`
}

export function membershipStatusForMember(member: DirectoryMember): MembershipStatus {
  return resolveMembershipStatus({
    application_status: member.membership_status,
    role: member.role,
    full_name: member.full_name,
  })
}

export function applicationStatusForMember(
  member: DirectoryMember
): ApplicationStatus {
  return resolveApplicationStatus({
    application_status: member.membership_status,
    role: member.role,
  })
}

export function membershipBadgeLabel(member: DirectoryMember): string {
  return membershipStatusLabel(membershipStatusForMember(member))
}

export function roleFilterLabel(role: string): string {
  if (role === 'all') return 'All roles'
  return roleLabel(role)
}

export const ROLE_FILTER_OPTIONS = [
  { value: 'all', label: 'All roles' },
  { value: 'member', label: 'Members' },
  { value: 'host', label: 'Hosts' },
  { value: 'admin', label: 'Administrators' },
] as const

export type RoleFilterValue = (typeof ROLE_FILTER_OPTIONS)[number]['value']

export function filterDirectoryMembers(
  members: DirectoryMember[],
  query: string,
  roleFilter: RoleFilterValue
): DirectoryMember[] {
  const normalizedQuery = query.trim().toLowerCase()

  return members.filter((member) => {
    const matchesRole =
      roleFilter === 'all' || (member.role ?? 'member') === roleFilter

    if (!matchesRole) return false

    if (!normalizedQuery) return true

    const name = member.full_name?.toLowerCase() ?? ''
    const email = member.email?.toLowerCase() ?? ''
    const intent = member.membership_intent?.toLowerCase() ?? ''
    const role = (member.role ?? 'member').toLowerCase()

    return (
      name.includes(normalizedQuery) ||
      email.includes(normalizedQuery) ||
      intent.includes(normalizedQuery) ||
      role.includes(normalizedQuery)
    )
  })
}
