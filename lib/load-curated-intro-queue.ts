import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { memberDisplayName } from '@/lib/members-discovery'

export type CuratedIntroQueueItem = {
  id: string
  status: string
  createdAt: string
  memberNote: string | null
  adminNotes: string | null
  recommendationId: string | null
  conversationId: string | null
  compatibilityScore: number | null
  recommendationStatus: string | null
  requester: {
    id: string
    name: string
    email: string | null
  }
  target: {
    id: string
    name: string
    email: string | null
  } | null
}

type IntroRow = {
  id: string
  status: string
  created_at: string
  note: string | null
  admin_notes: string | null
  requester_id: string
  target_member_id: string | null
  recommendation_id: string | null
  conversation_id: string | null
}

type ProfileRow = {
  id: string
  full_name: string | null
  email: string | null
}

type RecommendationRow = {
  id: string
  compatibility_score: number
  status: string
}

function profileSummary(profile: ProfileRow | undefined, fallbackId: string) {
  return {
    id: fallbackId,
    name: profile
      ? memberDisplayName({
          id: profile.id,
          full_name: profile.full_name,
          email: profile.email,
        } as Parameters<typeof memberDisplayName>[0])
      : 'Member',
    email: profile?.email ?? null,
  }
}

export async function loadCuratedIntroQueue(
  supabase: SupabaseClient<Database>,
  options: { pendingOnly?: boolean } = {}
): Promise<{ items: CuratedIntroQueueItem[]; error: string | null }> {
  let query = supabase
    .from('member_intro_requests')
    .select(
      'id, status, created_at, note, admin_notes, requester_id, target_member_id, recommendation_id, conversation_id'
    )
    .not('recommendation_id', 'is', null)
    .order('created_at', { ascending: true })

  if (options.pendingOnly) {
    query = query.eq('status', 'pending')
  }

  const { data: rows, error } = await query

  if (error) {
    if (error.code === '42P01') {
      return { items: [], error: null }
    }
    return { items: [], error: error.message }
  }

  const introRows = (rows ?? []) as IntroRow[]
  if (introRows.length === 0) {
    return { items: [], error: null }
  }

  const profileIds = [
    ...new Set(
      introRows.flatMap((row) =>
        [row.requester_id, row.target_member_id].filter(
          (id): id is string => Boolean(id)
        )
      )
    ),
  ]
  const recommendationIds = [
    ...new Set(
      introRows
        .map((row) => row.recommendation_id)
        .filter((id): id is string => Boolean(id))
    ),
  ]

  const profileById = new Map<string, ProfileRow>()
  if (profileIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', profileIds)

    for (const profile of profiles ?? []) {
      profileById.set(profile.id, profile)
    }
  }

  const recommendationById = new Map<string, RecommendationRow>()
  if (recommendationIds.length > 0) {
    const { data: recommendations } = await supabase
      .from('curated_match_recommendations')
      .select('id, compatibility_score, status')
      .in('id', recommendationIds)

    for (const recommendation of recommendations ?? []) {
      recommendationById.set(recommendation.id, recommendation)
    }
  }

  const items: CuratedIntroQueueItem[] = introRows.map((row) => {
    const recommendation = row.recommendation_id
      ? recommendationById.get(row.recommendation_id)
      : undefined

    return {
      id: row.id,
      status: row.status,
      createdAt: row.created_at,
      memberNote: row.note,
      adminNotes: row.admin_notes,
      recommendationId: row.recommendation_id,
      conversationId: row.conversation_id,
      compatibilityScore: recommendation?.compatibility_score ?? null,
      recommendationStatus: recommendation?.status ?? null,
      requester: profileSummary(profileById.get(row.requester_id), row.requester_id),
      target: row.target_member_id
        ? profileSummary(profileById.get(row.target_member_id), row.target_member_id)
        : null,
    }
  })

  return { items, error: null }
}
