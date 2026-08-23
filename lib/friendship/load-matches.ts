import type { SupabaseClient } from '@supabase/supabase-js'
import type { ApplicationPhoto } from '@/lib/application'
import type { Database } from '@/lib/database.types'
import { MEMBER_PROFILES_VIEW } from '@/lib/member-profiles-view'
import { memberDisplayName } from '@/lib/members-discovery'
import { photosFromApplicationDraft, primaryMemberPhoto } from '@/lib/member-photos'
import { friendshipFitLabel } from '@/lib/friendship/labels'
import { reasonsAreMemberSafe } from '@/lib/friendship/match-explanation'
import { toPublicFriendshipMatch, type PublicFriendshipMatch } from '@/lib/friendship/privacy'
import { isFriendshipMatchingEnabled } from '@/lib/friendship/eligibility'

export type FriendshipMatchListItem = PublicFriendshipMatch & {
  primaryPhoto: ApplicationPhoto | null
}

function parseReasons(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return []
  }
  const reasons = (value as { reasons?: unknown }).reasons
  if (!Array.isArray(reasons)) {
    return []
  }
  const labels = reasons.filter((item): item is string => typeof item === 'string')
  return reasonsAreMemberSafe(labels) ? labels.slice(0, 4) : []
}

export async function loadFriendshipMatchRecommendations(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<{ items: FriendshipMatchListItem[]; error: string | null }> {
  if (!isFriendshipMatchingEnabled()) {
    return { items: [], error: null }
  }
  const { data: rows, error } = await supabase
    .from('friendship_match_recommendations')
    .select(
      'id, recommended_user_id, compatibility_score, score_breakdown, status, created_at'
    )
    .eq('user_id', userId)
    .in('status', ['pending', 'viewed'])
    .order('created_at', { ascending: false })
    .limit(12)

  if (error) {
    if (error.code === '42P01') {
      return { items: [], error: null }
    }
    return { items: [], error: error.message }
  }

  const recommendedIds = [
    ...new Set((rows ?? []).map((row) => row.recommended_user_id)),
  ]

  const profileById = new Map<
    string,
    {
      id: string
      full_name: string | null
      location_area: string | null
      application_draft: unknown
    }
  >()

  if (recommendedIds.length > 0) {
    const { data: profiles } = await supabase
      .from(MEMBER_PROFILES_VIEW)
      .select('id, full_name, location_area, application_draft')
      .in('id', recommendedIds)

    for (const profile of profiles ?? []) {
      profileById.set(profile.id, profile)
    }
  }

  const items: FriendshipMatchListItem[] = []

  for (const row of rows ?? []) {
    const label = friendshipFitLabel(Number(row.compatibility_score))
    if (!label) {
      continue
    }

    const profile = profileById.get(row.recommended_user_id)
    const photos = photosFromApplicationDraft(profile?.application_draft)
    items.push(
      toPublicFriendshipMatch({
        id: row.id,
        recommendedUserId: row.recommended_user_id,
        displayName: profile ? memberDisplayName(profile) : 'Member',
        locationArea: profile?.location_area ?? null,
        primaryPhoto: primaryMemberPhoto(photos),
        fitLabel: label,
        matchReasons: parseReasons(row.score_breakdown),
        createdAt: row.created_at,
      }) as FriendshipMatchListItem
    )
  }

  return { items, error: null }
}
