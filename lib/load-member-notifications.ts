import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { NOTIFICATION_INBOX_LIMIT } from '@/lib/notification-ui'

export type MemberNotificationItem = {
  id: string
  type: string
  title: string
  body: string | null
  href: string
  readAt: string | null
  createdAt: string
}

export async function loadMemberNotificationUnreadCount(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<number> {
  const { count, error } = await supabase
    .from('member_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null)

  if (error) {
    if (error.code === '42P01') {
      return 0
    }
    throw new Error(error.message)
  }

  return count ?? 0
}

export async function loadMemberNotifications(
  supabase: SupabaseClient<Database>,
  userId: string,
  limit = NOTIFICATION_INBOX_LIMIT
): Promise<{ items: MemberNotificationItem[]; unreadCount: number }> {
  const [listResult, unreadCount] = await Promise.all([
    supabase
      .from('member_notifications')
      .select('id, type, title, body, href, read_at, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit),
    loadMemberNotificationUnreadCount(supabase, userId),
  ])

  if (listResult.error) {
    if (listResult.error.code === '42P01') {
      return { items: [], unreadCount: 0 }
    }
    throw new Error(listResult.error.message)
  }

  const items: MemberNotificationItem[] = (listResult.data ?? []).map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    href: row.href,
    readAt: row.read_at,
    createdAt: row.created_at,
  }))

  return { items, unreadCount }
}
