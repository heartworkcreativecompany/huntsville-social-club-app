import { parseApplicationDraft } from '@/lib/application'
import { publicProfileDetailsFromDraft } from '@/lib/application-profile-preview'
import type { ApplicationPublicProfileDetails } from '@/lib/application-profile-preview'
import { createClient } from '@/lib/supabase/server'
import { enrichProfileFromDraft } from '@/lib/enrich-profile-discovery'
import {
  buildDirectoryMember,
  type DirectoryMember,
} from '@/lib/members-discovery'
import { photosFromApplicationDraft } from '@/lib/member-photos'
import {
  DIRECTORY_APPLICATION_FIELDS,
  DIRECTORY_FULL_FIELDS,
  isMissingSchemaColumnError,
} from '@/lib/profile-query-fields'
import { MEMBER_PROFILES_VIEW } from '@/lib/member-profiles-view'

type RawProfile = Parameters<typeof buildDirectoryMember>[0] & {
  application_draft?: unknown
}

function finalizeMember(
  profile: RawProfile,
  isAdmin: boolean
): DirectoryMember {
  const enriched = enrichProfileFromDraft(profile)
  const member = buildDirectoryMember(enriched)
  member.photos = photosFromApplicationDraft(enriched.application_draft)
  if (!isAdmin) {
    return {
      ...member,
      membership_intent: null,
      location_city: null,
      location_zip: null,
      birth_year: null,
    }
  }
  return member
}

async function fetchApprovedProfiles(
  supabase: Awaited<ReturnType<typeof createClient>>,
  viewerId: string,
  fields: string
) {
  return supabase
    .from(MEMBER_PROFILES_VIEW)
    .select(fields)
    .eq('application_status', 'approved')
    .neq('id', viewerId)
    .order('full_name', { ascending: true })
}

async function fetchProfileById(
  supabase: Awaited<ReturnType<typeof createClient>>,
  memberId: string,
  fields: string
) {
  return supabase.from(MEMBER_PROFILES_VIEW).select(fields).eq('id', memberId).single()
}

async function loadWithFieldFallback<T>(
  load: (fields: string) => Promise<{ data: T | null; error: { message: string } | null }>
): Promise<{ data: T | null; error: string | null; usedLegacyFields: boolean }> {
  const full = await load(DIRECTORY_FULL_FIELDS)
  if (!full.error && full.data) {
    return { data: full.data, error: null, usedLegacyFields: false }
  }

  if (full.error && !isMissingSchemaColumnError(full.error)) {
    return { data: null, error: full.error.message, usedLegacyFields: false }
  }

  const legacy = await load(DIRECTORY_APPLICATION_FIELDS)
  if (legacy.error) {
    return { data: null, error: legacy.error.message, usedLegacyFields: true }
  }

  return { data: legacy.data, error: null, usedLegacyFields: true }
}

export async function loadDirectoryProfiles(
  viewerId: string,
  canBrowseDiscovery: boolean,
  isAdmin: boolean
): Promise<{ members: DirectoryMember[]; error: string | null }> {
  if (!canBrowseDiscovery) {
    return { members: [], error: null }
  }

  const supabase = await createClient()

  const { data, error } = await loadWithFieldFallback((fields) =>
    fetchApprovedProfiles(supabase, viewerId, fields)
  )

  if (error || !data) {
    return { members: [], error }
  }

  const rows = (Array.isArray(data) ? data : [data]) as unknown as RawProfile[]

  return {
    members: rows.map((profile) => finalizeMember(profile, isAdmin)),
    error: null,
  }
}

export async function loadMemberProfile(
  memberId: string,
  viewerId: string,
  canBrowseDiscovery: boolean,
  isAdmin: boolean
): Promise<{
  member: DirectoryMember | null
  profileDetails: ApplicationPublicProfileDetails | null
  error: string | null
}> {
  const supabase = await createClient()

  const { data, error } = await loadWithFieldFallback((fields) =>
    fetchProfileById(supabase, memberId, fields)
  )

  if (error || !data) {
    return { member: null, profileDetails: null, error: error ?? 'Profile not found' }
  }

  const profile = data as unknown as RawProfile & {
    application_status?: string | null
  }
  const isSelf = memberId === viewerId
  const isApproved = profile.application_status === 'approved'

  if (!canBrowseDiscovery && !isSelf) {
    return { member: null, profileDetails: null, error: null }
  }

  if (!isSelf && !isApproved) {
    return { member: null, profileDetails: null, error: null }
  }

  const draft = profile.application_draft
    ? parseApplicationDraft(profile.application_draft)
    : null
  const profileDetails = draft ? publicProfileDetailsFromDraft(draft) : null

  return {
    member: finalizeMember(profile, isAdmin),
    profileDetails,
    error: null,
  }
}
