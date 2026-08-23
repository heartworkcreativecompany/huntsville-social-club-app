import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
  PUBLIC_RECOGNITION_BADGE_COLUMNS,
  toPublicRecognitionBadges,
  type PublicRecognitionBadge,
} from '@/lib/recognition-badges/catalog'

function isMissingRelationError(error: {
  code?: string
  message?: string
} | null): boolean {
  if (!error) return false
  if (error.code === '42P01' || error.code === '42703') return true
  const message = error.message?.toLowerCase() ?? ''
  return message.includes('does not exist') || message.includes('schema cache')
}

export async function loadPublicRecognitionBadgesByUserIds(
  supabase: SupabaseClient<Database>,
  userIds: string[]
): Promise<Map<string, PublicRecognitionBadge[]>> {
  const badgesByUser = new Map<string, PublicRecognitionBadge[]>()
  const uniqueIds = [...new Set(userIds.filter(Boolean))]
  if (uniqueIds.length === 0) return badgesByUser

  const { data, error } = await supabase
    .from('member_public_recognition_badges')
    .select(PUBLIC_RECOGNITION_BADGE_COLUMNS)
    .in('user_id', uniqueIds)
    .order('display_order', { ascending: true })

  if (error) {
    if (isMissingRelationError(error)) return badgesByUser
    return badgesByUser
  }

  for (const row of data ?? []) {
    const userId = row.user_id
    if (!userId) continue
    const current = badgesByUser.get(userId) ?? []
    current.push(
      ...toPublicRecognitionBadges([
        {
          badge_slug: row.badge_slug,
          public_label: row.public_label,
        },
      ])
    )
    badgesByUser.set(userId, current)
  }

  return badgesByUser
}

export async function attachPublicRecognitionBadges<
  T extends { id: string; recognitionBadges?: PublicRecognitionBadge[] },
>(
  supabase: SupabaseClient<Database>,
  members: T[]
): Promise<T[]> {
  const badgesByUser = await loadPublicRecognitionBadgesByUserIds(
    supabase,
    members.map((member) => member.id)
  )
  return members.map((member) => ({
    ...member,
    recognitionBadges: badgesByUser.get(member.id) ?? [],
  }))
}
