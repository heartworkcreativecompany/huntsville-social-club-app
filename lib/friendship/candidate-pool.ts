import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/database.types'
import { MEMBER_PROFILES_VIEW } from '@/lib/member-profiles-view'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadActiveMembershipAccessOverridesByUserIds } from '@/lib/membership-access-override/admin'
import type { SlimMembershipAccessOverride } from '@/lib/membership-access-override'
import {
  buildMemberEntitlements,
  canUseMessaging,
} from '@/lib/membership-entitlements'
import { isMessagingSuspended } from '@/lib/messaging-suspension'
import { includesFriendsIntent } from '@/lib/member-public-intent'
import { isFriendshipMatchingEnabled } from '@/lib/friendship/eligibility'
import { isFriendshipQuestionnaireSubmitted } from '@/lib/friendship/questionnaire'
import type { FriendshipQuestionnaireRow } from '@/lib/friendship/types'

export type FriendshipPoolProfile = {
  id: string
  application_status: string | null
  connection_intents: string[] | null
  role: string | null
  membership_billing: unknown
  messaging_suspended_at: string | null
  questionnaire: FriendshipQuestionnaireRow
}

const POOL_SELECT =
  'id, application_status, connection_intents, role, membership_billing, messaging_suspended_at'

export async function loadFriendshipQuestionnairesByUserIds(
  supabase: SupabaseClient<Database>,
  userIds: string[]
): Promise<Map<string, FriendshipQuestionnaireRow>> {
  const map = new Map<string, FriendshipQuestionnaireRow>()
  if (userIds.length === 0) {
    return map
  }

  const { data, error } = await supabase
    .from('friendship_questionnaires')
    .select('user_id, version, answers, status, completed_at, updated_at')
    .in('user_id', userIds)

  if (error) {
    if (error.code === '42P01') {
      return map
    }
    throw new Error(error.message)
  }

  for (const row of data ?? []) {
    map.set(row.user_id, row as FriendshipQuestionnaireRow)
  }

  return map
}

export async function loadOwnFriendshipQuestionnaire(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<FriendshipQuestionnaireRow | null> {
  const { data, error } = await supabase
    .from('friendship_questionnaires')
    .select('user_id, version, answers, status, completed_at, updated_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    if (error.code === '42P01') {
      return null
    }
    throw new Error(error.message)
  }

  return (data as FriendshipQuestionnaireRow | null) ?? null
}

export function memberHasPaidFriendshipEntitlement(profile: {
  role: string | null
  membership_billing: unknown
  application_status: string | null
  accessOverride?: SlimMembershipAccessOverride | null
}): boolean {
  return canUseMessaging(
    buildMemberEntitlements({
      role: profile.role,
      billing: profile.membership_billing,
      applicationApproved: profile.application_status === 'approved',
      accessOverride: profile.accessOverride ?? null,
    })
  )
}

export function isFriendshipMatchPoolCandidate(input: {
  application_status: string | null
  connection_intents: string[] | null
  role: string | null
  membership_billing: unknown
  messaging_suspended_at?: string | null
  questionnaire: {
    answers?: unknown
    status?: string | null
    completed_at?: string | null
  } | null
  accessOverride?: SlimMembershipAccessOverride | null
}): boolean {
  if (!isFriendshipMatchingEnabled()) {
    return false
  }
  if (input.application_status !== 'approved') {
    return false
  }
  if (!includesFriendsIntent(input.connection_intents)) {
    return false
  }
  if (isMessagingSuspended({ messaging_suspended_at: input.messaging_suspended_at })) {
    return false
  }
  if (
    !memberHasPaidFriendshipEntitlement({
      role: input.role,
      membership_billing: input.membership_billing,
      application_status: input.application_status,
      accessOverride: input.accessOverride ?? null,
    })
  ) {
    return false
  }
  return isFriendshipQuestionnaireSubmitted({
    answers: input.questionnaire?.answers,
    status: input.questionnaire?.status,
    completed_at: input.questionnaire?.completed_at,
  })
}

export async function loadFriendshipMatchPool(
  supabase: SupabaseClient<Database>
): Promise<{ profiles: FriendshipPoolProfile[]; error: string | null }> {
  if (!isFriendshipMatchingEnabled()) {
    return { profiles: [], error: null }
  }
  const { data: questionnaires, error: questionnaireError } = await supabase
    .from('friendship_questionnaires')
    .select('user_id, version, answers, status, completed_at, updated_at')
    .eq('status', 'submitted')
    .not('completed_at', 'is', null)

  if (questionnaireError) {
    if (questionnaireError.code === '42P01') {
      return {
        profiles: [],
        error: 'Friendship tables are missing. Run the latest database migrations.',
      }
    }
    return { profiles: [], error: questionnaireError.message }
  }

  const submitted = (questionnaires ?? []).filter((row) =>
    isFriendshipQuestionnaireSubmitted(row)
  )
  const userIds = submitted.map((row) => row.user_id)
  if (userIds.length === 0) {
    return { profiles: [], error: null }
  }

  const { data: profiles, error: profileError } = await supabase
    .from(MEMBER_PROFILES_VIEW)
    .select(POOL_SELECT)
    .eq('application_status', 'approved')
    .in('id', userIds)

  if (profileError) {
    return { profiles: [], error: profileError.message }
  }

  const questionnaireByUser = new Map(
    submitted.map((row) => [row.user_id, row as FriendshipQuestionnaireRow])
  )
  const overridesByUser = await loadActiveMembershipAccessOverridesByUserIds(
    createAdminClient(),
    (profiles ?? []).map((profile) => profile.id)
  )
  const pool: FriendshipPoolProfile[] = []

  for (const profile of profiles ?? []) {
    const questionnaire = questionnaireByUser.get(profile.id)
    if (
      !questionnaire ||
      !isFriendshipMatchPoolCandidate({
        application_status: profile.application_status,
        connection_intents: profile.connection_intents,
        role: profile.role,
        membership_billing: profile.membership_billing,
        messaging_suspended_at: profile.messaging_suspended_at,
        questionnaire,
        accessOverride: overridesByUser.get(profile.id) ?? null,
      })
    ) {
      continue
    }

    pool.push({
      id: profile.id,
      application_status: profile.application_status,
      connection_intents: profile.connection_intents,
      role: profile.role,
      membership_billing: profile.membership_billing,
      messaging_suspended_at: profile.messaging_suspended_at,
      questionnaire,
    })
  }

  return { profiles: pool, error: null }
}

export async function loadPassedFriendshipCandidateIds(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<Set<string>> {
  const passed = new Set<string>()
  const { data, error } = await supabase
    .from('friendship_match_recommendations')
    .select('recommended_user_id')
    .eq('user_id', userId)
    .eq('status', 'passed')

  if (error) {
    if (error.code === '42P01') {
      return passed
    }
    throw new Error(error.message)
  }

  for (const row of data ?? []) {
    passed.add(row.recommended_user_id)
  }
  return passed
}

export function friendshipAnswersJson(
  answers: unknown
): Json {
  return answers as Json
}
