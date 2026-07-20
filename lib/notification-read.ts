import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

export async function markNotificationReadForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  notificationId: string
): Promise<{ success: true } | { error: string }> {
  const { error } = await supabase
    .from('member_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('user_id', userId)
    .is('read_at', null)

  if (error) {
    if (error.code === '42P01') {
      return { success: true }
    }
    return { error: error.message }
  }

  return { success: true }
}

export async function markAllNotificationsReadForUser(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<{ success: true } | { error: string }> {
  const { error } = await supabase
    .from('member_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null)

  if (error) {
    if (error.code === '42P01') {
      return { success: true }
    }
    return { error: error.message }
  }

  return { success: true }
}
