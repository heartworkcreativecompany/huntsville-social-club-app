import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { memberDisplayName } from '@/lib/members-discovery'
import { MEMBER_PROFILES_VIEW } from '@/lib/member-profiles-view'
import type { MemberVouch, VouchStatus } from '@/lib/member-vouches'

export type VouchQueueFilter = VouchStatus | 'all'

export type VouchModerationItem = MemberVouch & {
  authorName: string
  recipientName: string
}

export function parseVouchQueueFilter(
  value: string | undefined
): VouchQueueFilter {
  if (value === 'pending' || value === 'approved' || value === 'rejected') {
    return value
  }
  return 'pending'
}

export async function loadVouchModerationQueue(
  supabase: SupabaseClient<Database>,
  filter: VouchQueueFilter
): Promise<{ items: VouchModerationItem[]; error: string | null }> {
  let query = supabase
    .from('member_vouches')
    .select('*')
    .order('created_at', { ascending: false })

  if (filter !== 'all') {
    query = query.eq('status', filter)
  }

  const { data, error } = await query
  if (error) {
    return { items: [], error: error.message }
  }

  const rows = (data ?? []) as MemberVouch[]
  const profileIds = [
    ...new Set(rows.flatMap((row) => [row.voucher_id, row.vouchee_id])),
  ]
  const names = new Map<string, string>()
  if (profileIds.length > 0) {
    const { data: profiles } = await supabase
      .from(MEMBER_PROFILES_VIEW)
      .select('id, full_name')
      .in('id', profileIds)
    for (const profile of profiles ?? []) {
      names.set(profile.id, memberDisplayName(profile))
    }
  }

  return {
    items: rows.map((row) => ({
      ...row,
      authorName: names.get(row.voucher_id) ?? 'Member',
      recipientName: names.get(row.vouchee_id) ?? 'Member',
    })),
    error: null,
  }
}
