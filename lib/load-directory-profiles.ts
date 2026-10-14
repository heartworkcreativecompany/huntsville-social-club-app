import { parseApplicationDraft } from '@/lib/application'
import {
  clampDirectoryPage,
  directorySlice,
  MEMBER_DIRECTORY_PAGE_SIZE,
} from '@/lib/directory-pagination'
import {
  directoryBrowseNeedsEnrichedRoster,
  directoryNameIlikePattern,
  type DirectoryQueryState,
} from '@/lib/member-directory-query'
import {
  browseDirectoryMembers,
  buildDirectoryMember,
  normalizeDirectoryNameQuery,
  parseDirectoryBrowseState,
} from '@/lib/members-discovery'
import { publicProfileDetailsFromDraft } from '@/lib/application-profile-preview'
import type { ApplicationPublicProfileDetails } from '@/lib/application-profile-preview'
import { createClient } from '@/lib/supabase/server'
import { enrichProfileFromDraft } from '@/lib/enrich-profile-discovery'
import { type DirectoryMember } from '@/lib/members-discovery'
import { photosFromApplicationDraft } from '@/lib/member-photos'
import {
  DIRECTORY_APPLICATION_FIELDS,
  DIRECTORY_FULL_FIELDS,
  isMissingSchemaColumnError,
} from '@/lib/profile-query-fields'
import { MEMBER_PROFILES_VIEW } from '@/lib/member-profiles-view'
import { attachPublicRecognitionBadges } from '@/lib/recognition-badges/public'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadActiveMembershipAccessOverridesByUserIds } from '@/lib/membership-access-override/admin'
import type { SlimMembershipAccessOverride } from '@/lib/membership-access-override'

type RawProfile = Parameters<typeof buildDirectoryMember>[0] & {
  application_draft?: unknown
}

function finalizeMember(
  profile: RawProfile,
  isAdmin: boolean,
  accessOverride?: SlimMembershipAccessOverride | null
): DirectoryMember {
  const enriched = enrichProfileFromDraft(profile)
  const member = buildDirectoryMember(enriched, { accessOverride })
  member.photos = photosFromApplicationDraft(enriched.application_draft)
  if (!isAdmin) {
    return {
      ...member,
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
  const overrides = await loadActiveMembershipAccessOverridesByUserIds(
    createAdminClient(),
    rows.map((profile) => profile.id)
  )
  const members = await attachPublicRecognitionBadges(
    supabase,
    rows.map((profile) =>
      finalizeMember(profile, isAdmin, overrides.get(profile.id) ?? null)
    )
  )

  return {
    members,
    error: null,
  }
}

const DIRECTORY_INDEX_FIELDS = 'id, full_name'
const DIRECTORY_SCAN_PAGE_SIZE = 1000
const DIRECTORY_SCAN_ROW_CAP = 20000

type DirectoryClient = Awaited<ReturnType<typeof createClient>>

type DirectoryPageResult = {
  members: DirectoryMember[]
  matchCount: number
  eligibleCount: number
  page: number
  error: string | null
}

function emptyDirectoryPage(error: string | null = null): DirectoryPageResult {
  return {
    members: [],
    matchCount: 0,
    eligibleCount: 0,
    page: 1,
    error,
  }
}

function approvedDirectoryQuery(
  supabase: DirectoryClient,
  viewerId: string,
  fields: string,
  search: string
) {
  const name = normalizeDirectoryNameQuery(search)
  const query = supabase
    .from(MEMBER_PROFILES_VIEW)
    .select(fields)
    .eq('application_status', 'approved')
    .neq('id', viewerId)
  if (!name) return query
  return query.ilike('full_name', directoryNameIlikePattern(name))
}

async function scanApprovedRows(
  supabase: DirectoryClient,
  viewerId: string,
  fields: string,
  search: string
): Promise<{ data: RawProfile[]; error: string | null }> {
  const rows: RawProfile[] = []
  for (
    let from = 0;
    from < DIRECTORY_SCAN_ROW_CAP;
    from += DIRECTORY_SCAN_PAGE_SIZE
  ) {
    const { data, error } = await approvedDirectoryQuery(
      supabase,
      viewerId,
      fields,
      search
    )
      .order('id', { ascending: true })
      .range(from, from + DIRECTORY_SCAN_PAGE_SIZE - 1)

    if (error) return { data: [], error: error.message }
    const batch = (data ?? []) as unknown as RawProfile[]
    rows.push(...batch)
    if (batch.length < DIRECTORY_SCAN_PAGE_SIZE) {
      return { data: rows, error: null }
    }
  }

  return {
    data: [],
    error: 'The member directory is too large to search completely.',
  }
}

async function scanDirectoryRoster(
  supabase: DirectoryClient,
  viewerId: string,
  search: string
): Promise<{ data: RawProfile[]; error: string | null }> {
  const full = await scanApprovedRows(
    supabase,
    viewerId,
    DIRECTORY_FULL_FIELDS,
    search
  )
  if (!full.error) return full
  if (!isMissingSchemaColumnError({ message: full.error })) return full
  return scanApprovedRows(
    supabase,
    viewerId,
    DIRECTORY_APPLICATION_FIELDS,
    search
  )
}

async function hydrateDirectoryPage(
  supabase: DirectoryClient,
  viewerId: string,
  pageIds: string[],
  isAdmin: boolean
): Promise<{ members: DirectoryMember[]; error: string | null }> {
  if (pageIds.length === 0) return { members: [], error: null }

  const { data, error } = await loadWithFieldFallback(async (fields) => {
    const result = await supabase
      .from(MEMBER_PROFILES_VIEW)
      .select(fields)
      .in('id', pageIds)
      .eq('application_status', 'approved')
    return result
  })

  if (error || !data) {
    return { members: [], error: error ?? 'Could not load members' }
  }

  const rows = (Array.isArray(data) ? data : [data]) as unknown as RawProfile[]
  const byId = new Map(
    rows
      .filter((row) => row.id !== viewerId)
      .map((row) => [row.id, row] as const)
  )
  const ordered = pageIds
    .map((id) => byId.get(id))
    .filter((row): row is RawProfile => Boolean(row))
  const overrides = await loadActiveMembershipAccessOverridesByUserIds(
    createAdminClient(),
    ordered.map((row) => row.id)
  )
  const members = await attachPublicRecognitionBadges(
    supabase,
    ordered.map((row) =>
      finalizeMember(row, isAdmin, overrides.get(row.id) ?? null)
    )
  )
  return { members, error: null }
}

export async function loadDirectoryPage(
  viewerId: string,
  canBrowseDiscovery: boolean,
  isAdmin: boolean,
  query: DirectoryQueryState
): Promise<DirectoryPageResult> {
  if (!canBrowseDiscovery) return emptyDirectoryPage()

  const supabase = await createClient()
  const { count, error: countError } = await supabase
    .from(MEMBER_PROFILES_VIEW)
    .select('id', { count: 'exact', head: true })
    .eq('application_status', 'approved')
    .neq('id', viewerId)

  if (countError) return emptyDirectoryPage(countError.message)

  const eligibleCount = count ?? 0
  if (eligibleCount === 0) return emptyDirectoryPage()

  const browse = parseDirectoryBrowseState(query.browse)
  const search = normalizeDirectoryNameQuery(query.search)
  const fields = directoryBrowseNeedsEnrichedRoster(browse)
    ? null
    : DIRECTORY_INDEX_FIELDS
  const scanned = fields
    ? await scanApprovedRows(supabase, viewerId, fields, search)
    : await scanDirectoryRoster(supabase, viewerId, search)

  if (scanned.error) {
    return { ...emptyDirectoryPage(scanned.error), eligibleCount }
  }

  const matched = browseDirectoryMembers(
    scanned.data.map((row) =>
      buildDirectoryMember({
        ...row,
        full_name: row.full_name ?? null,
        role: row.role ?? null,
        created_at: row.created_at ?? null,
      })
    ),
    browse,
    search
  )
  const page = clampDirectoryPage(
    query.page,
    matched.length,
    MEMBER_DIRECTORY_PAGE_SIZE
  )
  const pageIds = directorySlice(
    matched,
    page,
    MEMBER_DIRECTORY_PAGE_SIZE
  ).map((member) => member.id)
  const hydrated = await hydrateDirectoryPage(
    supabase,
    viewerId,
    pageIds,
    isAdmin
  )

  if (hydrated.error) {
    return {
      members: [],
      matchCount: matched.length,
      eligibleCount,
      page,
      error: hydrated.error,
    }
  }

  return {
    members: hydrated.members,
    matchCount: matched.length,
    eligibleCount,
    page,
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
  const overrides = await loadActiveMembershipAccessOverridesByUserIds(
    createAdminClient(),
    [profile.id]
  )
  const [member] = await attachPublicRecognitionBadges(supabase, [
    finalizeMember(profile, isAdmin, overrides.get(profile.id) ?? null),
  ])

  return {
    member,
    profileDetails,
    error: null,
  }
}
