'use server'

import { revalidatePath } from 'next/cache'
import {
  markAllNotificationsReadForUser,
  markNotificationReadForUser,
} from '@/lib/notification-read'
import { createClient } from '@/lib/supabase/server'

export async function markNotificationRead(notificationId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in.' }
  }

  const result = await markNotificationReadForUser(
    supabase,
    user.id,
    notificationId
  )

  if ('error' in result) {
    return result
  }

  revalidatePath('/', 'layout')
  return { success: true as const }
}

export async function markAllNotificationsRead() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in.' }
  }

  const result = await markAllNotificationsReadForUser(supabase, user.id)

  if ('error' in result) {
    return result
  }

  revalidatePath('/', 'layout')
  return { success: true as const }
}
