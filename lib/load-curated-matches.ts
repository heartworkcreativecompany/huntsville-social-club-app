import type { SupabaseClient } from '@supabase/supabase-js'
import { isArchivedRecommendationStatus } from '@/lib/compatibility/recommendation-lifecycle-config'
import type { ApplicationPhoto } from '@/lib/application'
import type { Database } from '@/lib/database.types'
import { MEMBER_PROFILES_VIEW } from '@/lib/member-profiles-view'
import {
  deriveMatchExplanations,
  listSharedInterestLabels,
} from '@/lib/compatibility/match-explanation'
import { memberDisplayName } from '@/lib/members-discovery'
import { photosFromApplicationDraft, primaryMemberPhoto } from '@/lib/member-photos'

export type CuratedMatchIntroStatus =
  | 'none'
  | 'pending'
  | 'matched'
  | 'declined'
  | 'closed'

export type CuratedMatchListItem = {
  id: string
  recommendedUserId: string
  displayName: string
  locationArea: string | null
  membershipIntent: string | null
  primaryPhoto: ApplicationPhoto | null
  compatibilityScore: number
  matchExplanations: string[]
  status: string
  createdAt: string
  expiresAt: string | null
  introStatus: CuratedMatchIntroStatus
  conversationId: string | null
}

export type LoadCuratedMatchRecommendationsContext = {
  viewerInterests?: string[] | null
}

function parseScoreBreakdown(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

export async function loadCuratedMatchRecommendations(
  supabase: SupabaseClient<Database>,
  userId: string,
  context: LoadCuratedMatchRecommendationsContext = {}
): Promise<{ items: CuratedMatchListItem[]; error: string | null }> {
  const { data: rows, error } = await supabase
    .from('curated_match_recommendations')
    .select(
      'id, recommended_user_id, compatibility_score, score_breakdown, status, created_at, expires_at'
    )
    .eq('user_id', userId)
    .in('status', ['pending', 'viewed', 'accepted', 'passed', 'declined', 'expired'])
    .order('created_at', { ascending: false })
    .limit(24)

  if (error) {
    if (error.code === '42P01') {
      return { items: [], error: null }
    }
    return { items: [], error: error.message }
  }

  const recommendationIds = (rows ?? []).map((row) => row.id)
  const recommendedIds = [
    ...new Set((rows ?? []).map((row) => row.recommended_user_id)),
  ]

  const profileById = new Map<
    string,
    {
      id: string
      full_name: string | null
      location_area: string | null
      membership_intent: string | null
      application_draft: unknown
      discovery_interests: string[] | null
    }
  >()

  if (recommendedIds.length > 0) {
    const { data: profiles } = await supabase
      .from(MEMBER_PROFILES_VIEW)
      .select(
        'id, full_name, location_area, membership_intent, application_draft, discovery_interests'
      )
      .in('id', recommendedIds)

    for (const profile of profiles ?? []) {
      profileById.set(profile.id, profile)
    }
  }

  const introStatusByRecommendation = new Map<string, CuratedMatchIntroStatus>()
  const conversationIdByRecommendation = new Map<string, string>()
  if (recommendationIds.length > 0) {
    const { data: intros, error: introError } = await supabase
      .from('member_intro_requests')
      .select('recommendation_id, status, conversation_id')
      .eq('requester_id', userId)
      .in('recommendation_id', recommendationIds)

    if (!introError) {
      for (const intro of intros ?? []) {
        if (!intro.recommendation_id) continue
        introStatusByRecommendation.set(
          intro.recommendation_id,
          intro.status as CuratedMatchIntroStatus
        )
        if (intro.conversation_id) {
          conversationIdByRecommendation.set(
            intro.recommendation_id,
            intro.conversation_id
          )
        }
      }
    }
  }

  const items: CuratedMatchListItem[] = (rows ?? []).map((row) => {
    const profile = profileById.get(row.recommended_user_id)
    const photos = photosFromApplicationDraft(profile?.application_draft)
    const scoreBreakdown = parseScoreBreakdown(row.score_breakdown)
    const sharedInterestLabels = listSharedInterestLabels(
      context.viewerInterests,
      profile?.discovery_interests
    )

    return {
      id: row.id,
      recommendedUserId: row.recommended_user_id,
      displayName: profile
        ? memberDisplayName(profile)
        : 'Member',
      locationArea: profile?.location_area ?? null,
      membershipIntent: profile?.membership_intent ?? null,
      primaryPhoto: primaryMemberPhoto(photos),
      compatibilityScore: row.compatibility_score,
      matchExplanations: deriveMatchExplanations({
        scoreBreakdown,
        candidateLocationArea: profile?.location_area ?? null,
        sharedInterestLabels,
      }),
      status: row.status,
      createdAt: row.created_at,
      expiresAt: row.expires_at ?? null,
      introStatus: introStatusByRecommendation.get(row.id) ?? 'none',
      conversationId: conversationIdByRecommendation.get(row.id) ?? null,
    }
  })

  return { items, error: null }
}

export function sortCuratedMatchItems(
  items: CuratedMatchListItem[]
): CuratedMatchListItem[] {
  return [...items].sort((left, right) => {
    const leftArchived = isArchivedRecommendationStatus(left.status) ? 1 : 0
    const rightArchived = isArchivedRecommendationStatus(right.status) ? 1 : 0
    if (leftArchived !== rightArchived) {
      return leftArchived - rightArchived
    }
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  })
}
