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
import {
  MEMBER_DIRECTORY_PROFILES,
  MEMBER_DIRECTORY_PROFILE_FIELDS,
  prepareSafeDirectoryRow,
} from '@/lib/member-directory-profiles'
import { attachPublicRecognitionBadges } from '@/lib/recognition-badges/public'
import { attachPublicIdentityDecisions } from '@/lib/identity-verification-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadActiveMembershipAccessOverridesByUserIds } from '@/lib/membership-access-override/admin'
import type { SlimMembershipAccessOverride } from '@/lib/membership-access-override'

type RawProfile = Parameters<typeof buildDirectoryMember>[0] & {
  application_draft?: unknown
  public_profile?: unknown
  profile_checks_approved?: boolean | null
}

function directoryRelation(isAdmin: boolean) {
  return isAdmin ? MEMBER_PROFILES_VIEW : MEMBER_DIRECTORY_PROFILES
}

async function withPublicBadgeInputs(
  rows: RawProfile[],
  isAdmin: boolean
): Promise<RawProfile[]> {
  if (isAdmin || rows.length === 0) return rows
  const admin = createAdminClient()
  if (!admin) return rows
  const { data } = await admin
    .from('profiles')
    .select('id, membership_billing, premium_verification')
    .in(
      'id',
      rows.map((row) => row.id)
    )
  const byId = new Map((data ?? []).map((row) => [row.id, row]))
  return rows.map((row) => {
    const extra = byId.get(row.id)
    if (!extra) return row
    return {
      ...row,
      membership_billing: extra.membership_billing,
      premium_verification: extra.premium_verification,
    }
  })
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
  fields: string,
  hideRemoved = true,
  isAdmin = false
) {
  const query = supabase
    .from(directoryRelation(isAdmin))
    .select(isAdmin ? fields : MEMBER_DIRECTORY_PROFILE_FIELDS)
    .eq('application_status', 'approved')
    .neq('id', viewerId)
  const filtered = hideRemoved ? query.is('removed_at', null) : query
  return filtered.order('full_name', { ascending: true })
}

async function fetchProfileById(
  supabase: Awaited<ReturnType<typeof createClient>>,
  memberId: string,
  fields: string,
  hideRemoved = true,
  isAdmin = false,
  isSelf = false
) {
  const fullRow = isAdmin || isSelf
  const query = supabase
    .from(fullRow ? MEMBER_PROFILES_VIEW : MEMBER_DIRECTORY_PROFILES)
    .select(fullRow ? fields : MEMBER_DIRECTORY_PROFILE_FIELDS)
    .eq('id', memberId)
  return (hideRemoved ? query.is('removed_at', null) : query).single()
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

async function loadSafeRows<T>(
  load: () => Promise<{ data: T | null; error: { message: string } | null }>
): Promise<{ data: T | null; error: string | null; usedLegacyFields: boolean }> {
  const result = await load()
  if (result.error) {
    return { data: null, error: result.error.message, usedLegacyFields: false }
  }
  return { data: result.data, error: null, usedLegacyFields: false }
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

  let loaded = isAdmin
    ? await loadWithFieldFallback((fields) =>
        fetchApprovedProfiles(supabase, viewerId, fields, true, true)
      )
    : await loadSafeRows(() =>
        fetchApprovedProfiles(supabase, viewerId, MEMBER_DIRECTORY_PROFILE_FIELDS, true, false)
      )
  if (
    isAdmin &&
    loaded.error &&
    isMissingSchemaColumnError({ message: loaded.error })
  ) {
    loaded = await loadWithFieldFallback((fields) =>
      fetchApprovedProfiles(supabase, viewerId, fields, false, true)
    )
  }
  const { data, error } = loaded

  if (error || !data) {
    return { members: [], error }
  }

  const rawRows = (Array.isArray(data) ? data : [data]) as unknown as RawProfile[]
  const rows = await withPublicBadgeInputs(
    isAdmin ? rawRows : rawRows.map((row) => prepareSafeDirectoryRow(row)),
    isAdmin
  )
  const overrides = await loadActiveMembershipAccessOverridesByUserIds(
    createAdminClient(),
    rows.map((profile) => profile.id)
  )
  const members = await attachPublicIdentityDecisions(
    createAdminClient(),
    await attachPublicRecognitionBadges(
      supabase,
      rows.map((profile) =>
        finalizeMember(profile, isAdmin, overrides.get(profile.id) ?? null)
      )
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
  search: string,
  hideRemoved = true,
  isAdmin = false
) {
  const name = normalizeDirectoryNameQuery(search)
  const base = supabase
    .from(directoryRelation(isAdmin))
    .select(isAdmin ? fields : fields === DIRECTORY_INDEX_FIELDS ? fields : MEMBER_DIRECTORY_PROFILE_FIELDS)
    .eq('application_status', 'approved')
    .neq('id', viewerId)
  const query = hideRemoved ? base.is('removed_at', null) : base
  if (!name) return query
  return query.ilike('full_name', directoryNameIlikePattern(name))
}

async function scanApprovedRows(
  supabase: DirectoryClient,
  viewerId: string,
  fields: string,
  search: string,
  hideRemoved = true,
  isAdmin = false
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
      search,
      hideRemoved,
      isAdmin
    )
      .order('id', { ascending: true })
      .range(from, from + DIRECTORY_SCAN_PAGE_SIZE - 1)

    if (error) return { data: [], error: error.message }
    const batch = ((data ?? []) as unknown as RawProfile[]).map((row) =>
      isAdmin ? row : prepareSafeDirectoryRow(row)
    )
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
  search: string,
  isAdmin: boolean
): Promise<{ data: RawProfile[]; error: string | null }> {
  if (!isAdmin) {
    return scanApprovedRows(
      supabase,
      viewerId,
      MEMBER_DIRECTORY_PROFILE_FIELDS,
      search,
      true,
      false
    )
  }
  const full = await scanApprovedRows(
    supabase,
    viewerId,
    DIRECTORY_FULL_FIELDS,
    search,
    true,
    true
  )
  if (!full.error) return full
  if (!isMissingSchemaColumnError({ message: full.error })) return full
  const withoutRemoval = await scanApprovedRows(
    supabase,
    viewerId,
    DIRECTORY_FULL_FIELDS,
    search,
    false,
    true
  )
  if (!withoutRemoval.error) return withoutRemoval
  return scanApprovedRows(
    supabase,
    viewerId,
    DIRECTORY_APPLICATION_FIELDS,
    search,
    false,
    true
  )
}

async function hydrateDirectoryPage(
  supabase: DirectoryClient,
  viewerId: string,
  pageIds: string[],
  isAdmin: boolean
): Promise<{ members: DirectoryMember[]; error: string | null }> {
  if (pageIds.length === 0) return { members: [], error: null }

  let hydrated = isAdmin
    ? await loadWithFieldFallback(async (fields) => {
        const result = await supabase
          .from(MEMBER_PROFILES_VIEW)
          .select(fields)
          .in('id', pageIds)
          .eq('application_status', 'approved')
          .is('removed_at', null)
        return result
      })
    : await loadSafeRows(async () => {
        const result = await supabase
          .from(MEMBER_DIRECTORY_PROFILES)
          .select(MEMBER_DIRECTORY_PROFILE_FIELDS)
          .in('id', pageIds)
          .eq('application_status', 'approved')
          .is('removed_at', null)
        return result
      })
  if (
    isAdmin &&
    hydrated.error &&
    isMissingSchemaColumnError({ message: hydrated.error })
  ) {
    hydrated = await loadWithFieldFallback(async (fields) => {
      const result = await supabase
        .from(MEMBER_PROFILES_VIEW)
        .select(fields)
        .in('id', pageIds)
        .eq('application_status', 'approved')
      return result
    })
  }
  const { data, error } = hydrated

  if (error || !data) {
    return { members: [], error: error ?? 'Could not load members' }
  }

  const loadedRows = (Array.isArray(data) ? data : [data]) as unknown as RawProfile[]
  const rows = await withPublicBadgeInputs(
    isAdmin ? loadedRows : loadedRows.map((row) => prepareSafeDirectoryRow(row)),
    isAdmin
  )
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
  const members = await attachPublicIdentityDecisions(
    createAdminClient(),
    await attachPublicRecognitionBadges(
      supabase,
      ordered.map((row) =>
        finalizeMember(row, isAdmin, overrides.get(row.id) ?? null)
      )
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
  const countApproved = (hideRemoved: boolean) => {
    const query = supabase
      .from(directoryRelation(isAdmin))
      .select('id', { count: 'exact', head: true })
      .eq('application_status', 'approved')
      .neq('id', viewerId)
    return hideRemoved ? query.is('removed_at', null) : query
  }
  let counted = await countApproved(true)
  if (isAdmin && counted.error && isMissingSchemaColumnError(counted.error)) {
    counted = await countApproved(false)
  }
  const { count, error: countError } = counted

  if (countError) return emptyDirectoryPage(countError.message)

  const eligibleCount = count ?? 0
  if (eligibleCount === 0) return emptyDirectoryPage()

  const browse = parseDirectoryBrowseState(query.browse)
  const search = normalizeDirectoryNameQuery(query.search)
  const fields = directoryBrowseNeedsEnrichedRoster(browse)
    ? null
    : DIRECTORY_INDEX_FIELDS
  let scanned = fields
    ? await scanApprovedRows(supabase, viewerId, fields, search, true, isAdmin)
    : await scanDirectoryRoster(supabase, viewerId, search, isAdmin)
  if (
    isAdmin &&
    fields &&
    scanned.error &&
    isMissingSchemaColumnError({ message: scanned.error })
  ) {
    scanned = await scanApprovedRows(supabase, viewerId, fields, search, false, true)
  }

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
  const isSelf = memberId === viewerId
  const fullRow = isAdmin || isSelf

  let loadedProfile = fullRow
    ? await loadWithFieldFallback((fields) =>
        fetchProfileById(supabase, memberId, fields, true, isAdmin, isSelf)
      )
    : await loadSafeRows(() =>
        fetchProfileById(
          supabase,
          memberId,
          MEMBER_DIRECTORY_PROFILE_FIELDS,
          true,
          false,
          false
        )
      )
  if (
    fullRow &&
    loadedProfile.error &&
    isMissingSchemaColumnError({ message: loadedProfile.error })
  ) {
    loadedProfile = await loadWithFieldFallback((fields) =>
      fetchProfileById(supabase, memberId, fields, false, isAdmin, isSelf)
    )
  }
  const { data, error } = loadedProfile

  if (error || !data) {
    return { member: null, profileDetails: null, error: error ?? 'Profile not found' }
  }

  const loadedProfileRow = data as unknown as RawProfile & {
    application_status?: string | null
  }
  const [profile] = await withPublicBadgeInputs(
    [fullRow ? loadedProfileRow : prepareSafeDirectoryRow(loadedProfileRow)],
    isAdmin || isSelf
  )
  if (!profile) {
    return { member: null, profileDetails: null, error: 'Profile not found' }
  }
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
  const [member] = await attachPublicIdentityDecisions(
    createAdminClient(),
    await attachPublicRecognitionBadges(supabase, [
      finalizeMember(profile, isAdmin, overrides.get(profile.id) ?? null),
    ])
  )

  return {
    member,
    profileDetails,
    error: null,
  }
}
