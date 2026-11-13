'use server'

import { createClient } from '@/lib/supabase/server'
import {
  escapeHostSearchQuery,
  normalizeHostSearchQuery,
} from '@/lib/event-host-assignment'
import { MEMBER_PROFILES_VIEW } from '@/lib/member-profiles-view'
import { getViewer } from '@/lib/viewer'

export type HostSearchResult = {
  id: string
  fullName: string
  role: 'host' | 'admin'
}

export async function searchHostingMembers(query: string): Promise<
  | { members: HostSearchResult[] }
  | { error: string; members: [] }
> {
  const viewer = await getViewer()
  if (!viewer) {
    return { error: 'You must be signed in.', members: [] }
  }
  if (viewer.role !== 'admin') {
    return { error: 'Administrator access required.', members: [] }
  }

  const normalized = normalizeHostSearchQuery(query)
  if ('error' in normalized) {
    return { error: normalized.error, members: [] }
  }

  const pattern = `%${escapeHostSearchQuery(normalized.query)}%`
  const supabase = await createClient()
  const { data, error } = await supabase
    .from(MEMBER_PROFILES_VIEW)
    .select('id, full_name, role')
    .in('role', ['host', 'admin'])
    .is('removed_at', null)
    .ilike('full_name', pattern)
    .order('full_name', { ascending: true })
    .limit(15)

  if (error || !data) {
    return { error: 'Could not search hosting members.', members: [] }
  }

  return {
    members: data
      .filter(
        (row): row is typeof row & { role: 'host' | 'admin'; full_name: string } =>
          (row.role === 'host' || row.role === 'admin') &&
          Boolean(row.full_name?.trim())
      )
      .map((row) => ({
        id: row.id,
        fullName: row.full_name.trim(),
        role: row.role,
      })),
  }
}
