import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { MEMBER_PROFILES_VIEW } from '@/lib/member-profiles-view'
import type { SlimMembershipAccessOverride } from '@/lib/membership-access-override'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadActiveMembershipAccessOverridesByUserIds } from '@/lib/membership-access-override/admin'
import { loadActiveEntitlementCyclesByUserIds } from '@/lib/membership-billing-cycles'
import {
  canGenerateMatches,
  isCompatibilityFeatureEnabled,
} from '@/lib/compatibility/eligibility'
import type { CompatibilityProfileFields } from '@/lib/compatibility/types'
import type { ScorableMemberProfile } from '@/lib/compatibility/scoring'
import type { EntitlementCycle } from '@/lib/membership-entitlements'
import { isMessagingSuspended } from '@/lib/messaging-suspension'

export type MatchPoolProfile = CompatibilityProfileFields &
  ScorableMemberProfile & {
    id: string
    messaging_suspended_at: string | null
    last_match_generation_at: string | null
    last_match_review_at: string | null
    accessOverride?: SlimMembershipAccessOverride | null
    activeCycle?: EntitlementCycle | null
  }

const MATCH_POOL_SELECT =
  'id, application_status, connection_intents, compatibility_questionnaire, compatibility_completed_at, wants_curated_matches, curated_matches_paused_at, curated_matches_pause_reason, role, membership_billing, discovery_interests, location_area, birth_year, age, preferred_match_age_min, preferred_match_age_max, messaging_suspended_at, last_match_generation_at, last_match_review_at'

export function isCandidateAvailable(
  profile: MatchPoolProfile,
  options?: {
    excludeUserIds?: Set<string>
    blockedUserIds?: Set<string>
    accessOverride?: SlimMembershipAccessOverride | null
    activeCycle?: EntitlementCycle | null
  }
): boolean {
  if (options?.excludeUserIds?.has(profile.id)) {
    return false
  }

  if (options?.blockedUserIds?.has(profile.id)) {
    return false
  }

  if (isMessagingSuspended(profile)) {
    return false
  }

  return canGenerateMatches(profile, {
    role: profile.role,
    billing: profile.membership_billing,
    applicationApproved: profile.application_status === 'approved',
    accessOverride:
      options?.accessOverride ?? profile.accessOverride ?? null,
    activeCycle: options?.activeCycle ?? profile.activeCycle ?? null,
  })
}

export async function loadMatchPoolProfiles(
  supabase: SupabaseClient<Database>
): Promise<{ profiles: MatchPoolProfile[]; error: string | null }> {
  if (!isCompatibilityFeatureEnabled()) {
    return { profiles: [], error: 'Compatibility matching is disabled.' }
  }

  const { data, error } = await supabase
    .from(MEMBER_PROFILES_VIEW)
    .select(MATCH_POOL_SELECT)
    .eq('application_status', 'approved')
    .contains('connection_intents', ['dating'])
    .not('compatibility_completed_at', 'is', null)
    .eq('wants_curated_matches', true)
    .is('curated_matches_paused_at', null)
    .not('age', 'is', null)
    .not('preferred_match_age_min', 'is', null)
    .not('preferred_match_age_max', 'is', null)

  if (error) {
    if (error.code === '42P01') {
      return {
        profiles: [],
        error: 'Compatibility tables are missing. Run the latest database migrations.',
      }
    }
    return { profiles: [], error: error.message }
  }

  const profiles = (data ?? []) as MatchPoolProfile[]
  const overrides = await loadActiveMembershipAccessOverridesByUserIds(
    createAdminClient(),
    profiles.map((profile) => profile.id)
  )
  const cycles = await loadActiveEntitlementCyclesByUserIds(
    supabase,
    profiles.map((profile) => profile.id)
  )
  return {
    profiles: profiles.map((profile) => ({
      ...profile,
      accessOverride: overrides.get(profile.id) ?? null,
      activeCycle: cycles.get(profile.id) ?? null,
    })),
    error: null,
  }
}

export async function loadMatchPoolProfileForUser(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<MatchPoolProfile | null> {
  const { data, error } = await supabase
    .from(MEMBER_PROFILES_VIEW)
    .select(MATCH_POOL_SELECT)
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    if (error.code === '42P01') {
      return null
    }
    throw new Error(error.message)
  }

  if (!data) return null
  const profile = data as MatchPoolProfile
  const overrides = await loadActiveMembershipAccessOverridesByUserIds(
    createAdminClient(),
    [profile.id]
  )
  const cycles = await loadActiveEntitlementCyclesByUserIds(supabase, [profile.id])
  return {
    ...profile,
    accessOverride: overrides.get(profile.id) ?? null,
    activeCycle: cycles.get(profile.id) ?? null,
  }
}

export async function loadBlockedUserIdsForMember(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<Set<string>> {
  const blocked = new Set<string>()

  const { data: rows, error } = await supabase
    .from('member_member_blocks')
    .select('blocker_id, blocked_member_id')
    .or(`blocker_id.eq.${userId},blocked_member_id.eq.${userId}`)

  if (error) {
    if (error.code === '42P01') {
      return blocked
    }
    throw new Error(error.message)
  }

  for (const row of rows ?? []) {
    if (row.blocker_id === userId) {
      blocked.add(row.blocked_member_id)
    } else if (row.blocked_member_id === userId) {
      blocked.add(row.blocker_id)
    }
  }

  return blocked
}

export function isEligibleRecipient(
  profile: MatchPoolProfile,
  accessOverride?: SlimMembershipAccessOverride | null
): boolean {
  if (isMessagingSuspended(profile)) {
    return false
  }

  return canGenerateMatches(profile, {
    role: profile.role,
    billing: profile.membership_billing,
    applicationApproved: profile.application_status === 'approved',
    accessOverride: accessOverride ?? profile.accessOverride ?? null,
    activeCycle: profile.activeCycle ?? null,
  })
}

export function listEligibleRecipients(
  profiles: MatchPoolProfile[],
  overridesByUser?: Map<string, SlimMembershipAccessOverride>
): MatchPoolProfile[] {
  return profiles.filter((profile) =>
    isEligibleRecipient(profile, overridesByUser?.get(profile.id) ?? null)
  )
}

export async function loadMatchPoolAccessOverrides(
  userIds: string[]
): Promise<Map<string, SlimMembershipAccessOverride>> {
  return loadActiveMembershipAccessOverridesByUserIds(
    createAdminClient(),
    userIds
  )
}
