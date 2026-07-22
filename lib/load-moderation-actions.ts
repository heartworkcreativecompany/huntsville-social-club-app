import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { memberDisplayName } from '@/lib/members-discovery'
import type { ModerationActionType } from '@/lib/moderation-actions'

export type ModerationActionLogMember = {
  id: string
  name: string
  email: string | null
}

export type ModerationActionLogItem = {
  id: string
  actionType: string
  sourceType: string | null
  sourceId: string | null
  reason: string | null
  details: string | null
  createdAt: string
  actor: ModerationActionLogMember | null
  targetMember: ModerationActionLogMember | null
}

export type ModerationActionFilters = {
  actionType?: ModerationActionType
  targetMemberId?: string
  sourceType?: string
  days?: number
  limit?: number
}

type ActionRow = {
  id: string
  actor_id: string | null
  target_member_id: string | null
  action_type: string
  source_type: string | null
  source_id: string | null
  reason: string | null
  details: string | null
  created_at: string
}

type ProfileRow = {
  id: string
  full_name: string | null
  email: string | null
}

function toLogMember(
  profile: ProfileRow | undefined,
  fallbackId: string
): ModerationActionLogMember {
  return {
    id: fallbackId,
    name: profile ? memberDisplayName(profile) : 'Member',
    email: profile?.email ?? null,
  }
}

export async function loadModerationActions(
  supabase: SupabaseClient<Database>,
  filters: ModerationActionFilters = {}
): Promise<{ items: ModerationActionLogItem[]; error: string | null }> {
  const limit = filters.limit ?? 100

  let query = supabase
    .from('moderation_actions')
    .select(
      'id, actor_id, target_member_id, action_type, source_type, source_id, reason, details, created_at'
    )
    .order('created_at', { ascending: false })
    .limit(limit)

  if (filters.actionType) {
    query = query.eq('action_type', filters.actionType)
  }

  if (filters.targetMemberId) {
    query = query.eq('target_member_id', filters.targetMemberId)
  }

  if (filters.sourceType) {
    query = query.eq('source_type', filters.sourceType)
  }

  if (filters.days && filters.days > 0) {
    const since = new Date()
    since.setDate(since.getDate() - filters.days)
    query = query.gte('created_at', since.toISOString())
  }

  const { data: rows, error } = await query

  if (error) {
    if (error.code === '42P01') {
      return { items: [], error: null }
    }
    return { items: [], error: error.message }
  }

  const actionRows = (rows ?? []) as ActionRow[]
  if (actionRows.length === 0) {
    return { items: [], error: null }
  }

  const profileIds = new Set<string>()
  for (const row of actionRows) {
    if (row.actor_id) profileIds.add(row.actor_id)
    if (row.target_member_id) profileIds.add(row.target_member_id)
  }

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', [...profileIds])

  const profileById = new Map<string, ProfileRow>()
  for (const profile of profiles ?? []) {
    profileById.set(profile.id, profile)
  }

  const items: ModerationActionLogItem[] = actionRows.map((row) => ({
    id: row.id,
    actionType: row.action_type,
    sourceType: row.source_type,
    sourceId: row.source_id,
    reason: row.reason,
    details: row.details,
    createdAt: row.created_at,
    actor: row.actor_id
      ? toLogMember(profileById.get(row.actor_id), row.actor_id)
      : null,
    targetMember: row.target_member_id
      ? toLogMember(profileById.get(row.target_member_id), row.target_member_id)
      : null,
  }))

  return { items, error: null }
}
