import {
  resolveApplicationStatus,
  type ApplicationPhoto,
  type ApplicationStatus,
} from '@/lib/application'
import { enrichProfileFromDraft } from '@/lib/enrich-profile-discovery'
import {
  membershipStatusLabel,
  resolveMembershipStatus,
  type MembershipStatus,
} from '@/lib/membership'
import {
  ageFromBirthYear,
  cardTierBadges,
  cardVerificationBadges,
  isMemberPubliclyVerified,
  membershipTierBadge,
  parseApprovalGates,
  parseMembershipBilling,
  parsePremiumVerification,
  parseVerificationState,
  publicPremiumBadge,
  publicVerificationBadges,
  resolveMembershipTier,
  type DiscoveryIntent,
  type DisplayBadge,
  type MembershipTierKey,
  type VerificationState,
  discoveryIntentLabel,
} from '@/lib/membership-systems'

export { discoveryIntentLabel }

import { publicContactEmail } from '@/lib/member-contact-email'
import { roleLabel } from '@/lib/event-labels'
import {
  memberMatchesMixedIntentFilter,
  memberMatchesPublicIntentFilter,
  resolveMemberPublicIntents,
  type MemberPublicIntentValue,
} from '@/lib/member-public-intent'

export type DirectoryMember = {
  id: string
  contactEmail: string | null
  full_name: string | null
  role: string | null
  created_at: string | null
  membership_intent: string | null
  verified_at: string | null
  membership_status: string | null
  photos: ApplicationPhoto[]
  location_area: string | null
  discovery_intent: DiscoveryIntent | string | null
  location_city: string | null
  location_zip: string | null
  birth_year: number | null
  discovery_interests: string[]
  discovery_industry: string | null
  public_intents: MemberPublicIntentValue[]
  verification_state: VerificationState
  membership_tier: MembershipTierKey
  vendor_reviewed_badge: boolean
}

export type TrustBadge = DisplayBadge

export function memberDisplayName(member: DirectoryMember): string {
  if (member.full_name?.trim()) return member.full_name.trim()
  return 'Member'
}

export function memberAge(member: DirectoryMember): number | null {
  return ageFromBirthYear(member.birth_year)
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

/** @deprecated Use membershipTierBadges + verificationBadges */
export function trustBadges(member: DirectoryMember): TrustBadge[] {
  return directoryCardBadges(member)
}

/** Top badges for directory cards: tier + verified badge when fully verified. */
export function directoryCardBadges(member: DirectoryMember): DisplayBadge[] {
  const tier = cardTierBadges(member.membership_tier)
  const verification = cardVerificationBadges(member.verification_state)
  const badges = [...tier, ...verification]
  if (member.vendor_reviewed_badge) {
    badges.push({
      key: 'vendor_reviewed',
      label: 'Vendor reviewed',
      variant: 'trust',
    })
  }
  return badges.slice(0, 4)
}

/** Full badge set for profile detail pages. */
export function profilePageBadges(member: DirectoryMember): {
  tier: DisplayBadge
  verification: DisplayBadge[]
  premium: DisplayBadge | null
} {
  return {
    tier: membershipTierBadge(member.membership_tier),
    verification: publicVerificationBadges(member.verification_state),
    premium: member.vendor_reviewed_badge
      ? { key: 'vendor_reviewed', label: 'Vendor reviewed', variant: 'trust' }
      : null,
  }
}

export function buildDirectoryMember(
  profile: {
    id: string
    contact_email?: string | null
    show_contact_email?: boolean | null
    full_name: string | null
    role: string | null
    created_at: string | null
    application_status?: string | null
    membership_intent?: string | null
    verified_at?: string | null
    application_draft?: unknown
    location_area?: string | null
    discovery_intent?: string | null
    location_city?: string | null
    location_zip?: string | null
    birth_year?: number | null
    discovery_interests?: string[] | null
    discovery_industry?: string | null
    connections_open_to?: string[] | null
    connection_intents?: string[] | null
    verification_state?: unknown
    premium_verification?: unknown
    membership_billing?: unknown
  }
): DirectoryMember {
  const enriched = enrichProfileFromDraft(profile)
  const billing = parseMembershipBilling(enriched.membership_billing)
  const premium = parsePremiumVerification(enriched.premium_verification)
  const tier = resolveMembershipTier({
    application_status: enriched.application_status,
    role: enriched.role,
    billing,
    premium,
  })
  const vendorBadge = publicPremiumBadge(premium) !== null
  const publicIntents = resolveMemberPublicIntents({
    connection_intents: enriched.connection_intents,
    connections_open_to: enriched.connections_open_to,
    discovery_intent: enriched.discovery_intent,
  })

  return {
    id: enriched.id,
    contactEmail: publicContactEmail(enriched),
    full_name: enriched.full_name,
    role: enriched.role,
    created_at: enriched.created_at,
    membership_intent: enriched.membership_intent ?? null,
    verified_at: enriched.verified_at ?? null,
    membership_status: enriched.application_status ?? null,
    photos: [],
    location_area: enriched.location_area ?? null,
    discovery_intent: (enriched.discovery_intent as DiscoveryIntent) ?? null,
    location_city: enriched.location_city ?? null,
    location_zip: enriched.location_zip ?? null,
    birth_year: enriched.birth_year ?? null,
    discovery_interests: enriched.discovery_interests ?? [],
    discovery_industry: enriched.discovery_industry ?? null,
    public_intents: publicIntents,
    verification_state: parseVerificationState(enriched.verification_state),
    membership_tier: tier,
    vendor_reviewed_badge: vendorBadge,
  }
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

export const INTENT_FILTER_OPTIONS = [
  { value: 'all', label: 'All intents' },
  { value: 'dating', label: 'Dating' },
  { value: 'networking', label: 'Networking' },
  { value: 'friends', label: 'Friends' },
  { value: 'mixed', label: 'Mixed / open' },
] as const

export type IntentFilterValue = (typeof INTENT_FILTER_OPTIONS)[number]['value']

export const AGE_FILTER_OPTIONS = [
  { value: 'all', label: 'Any age', min: null, max: null },
  { value: '18-29', label: '18–29', min: 18, max: 29 },
  { value: '30-39', label: '30–39', min: 30, max: 39 },
  { value: '40-49', label: '40–49', min: 40, max: 49 },
  { value: '50+', label: '50+', min: 50, max: 120 },
] as const

export type AgeFilterValue = (typeof AGE_FILTER_OPTIONS)[number]['value']

export type DiscoveryFilters = {
  query: string
  roleFilter: RoleFilterValue
  intentFilter: IntentFilterValue
  ageFilter: AgeFilterValue
  locationQuery: string
  verifiedOnly: boolean
  interestFilter: string
  industryFilter: string
}

export const DEFAULT_DISCOVERY_FILTERS: DiscoveryFilters = {
  query: '',
  roleFilter: 'all',
  intentFilter: 'all',
  ageFilter: 'all',
  locationQuery: '',
  verifiedOnly: false,
  interestFilter: '',
  industryFilter: '',
}

export function filterDirectoryMembers(
  members: DirectoryMember[],
  filters: DiscoveryFilters
): DirectoryMember[] {
  const normalizedQuery = filters.query.trim().toLowerCase()
  const normalizedLocation = filters.locationQuery.trim().toLowerCase()
  const normalizedInterest = filters.interestFilter.trim().toLowerCase()
  const normalizedIndustry = filters.industryFilter.trim().toLowerCase()

  const ageOption = AGE_FILTER_OPTIONS.find((o) => o.value === filters.ageFilter)

  return members.filter((member) => {
    if (
      filters.roleFilter !== 'all' &&
      (member.role ?? 'member') !== filters.roleFilter
    ) {
      return false
    }

  if (filters.intentFilter !== 'all' && filters.intentFilter !== 'mixed') {
      if (
        !memberMatchesPublicIntentFilter(
          member.public_intents,
          filters.intentFilter as MemberPublicIntentValue
        )
      ) {
        return false
      }
    }

    if (
      filters.intentFilter === 'mixed' &&
      !memberMatchesMixedIntentFilter(
        member.public_intents,
        member.discovery_intent
      )
    ) {
      return false
    }

    if (filters.verifiedOnly && !isMemberPubliclyVerified(member.verification_state)) {
      return false
    }

    if (ageOption && ageOption.min !== null && ageOption.max !== null) {
      const age = memberAge(member)
      if (age === null || age < ageOption.min || age > ageOption.max) {
        return false
      }
    }

    if (normalizedLocation) {
      const loc = [
        member.location_area,
        member.location_city,
        member.location_zip,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!loc.includes(normalizedLocation)) return false
    }

    if (normalizedInterest) {
      const interests = (member.discovery_interests ?? []).map((i) =>
        i.toLowerCase()
      )
      if (!interests.some((i) => i.includes(normalizedInterest))) return false
    }

    if (normalizedIndustry) {
      const industry = member.discovery_industry?.toLowerCase() ?? ''
      if (!industry.includes(normalizedIndustry)) return false
    }

    if (!normalizedQuery) return true

    const name = member.full_name?.toLowerCase() ?? ''
    const intent = member.membership_intent?.toLowerCase() ?? ''
    const discoveryIntent = member.discovery_intent
      ? discoveryIntentLabel(member.discovery_intent).toLowerCase()
      : ''
    const role = (member.role ?? 'member').toLowerCase()

    return (
      name.includes(normalizedQuery) ||
      intent.includes(normalizedQuery) ||
      discoveryIntent.includes(normalizedQuery) ||
      role.includes(normalizedQuery)
    )
  })
}

export function collectInterestOptions(members: DirectoryMember[]): string[] {
  const set = new Set<string>()
  for (const member of members) {
    for (const interest of member.discovery_interests ?? []) {
      if (interest.trim()) set.add(interest.trim())
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}
