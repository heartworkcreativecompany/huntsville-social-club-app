'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertMessagingAllowed } from '@/lib/require-messaging'

export async function requestCuratedIntro(note?: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in.' }
  }

  const { error } = await supabase.from('member_intro_requests').insert({
    requester_id: user.id,
    kind: 'curated',
    note: note?.trim() || null,
    status: 'pending',
  })

  if (error) {
    if (error.code === '42P01') {
      return {
        error:
          'Intro requests are not available yet. Run the latest database migration.',
      }
    }
    return { error: error.message }
  }

  revalidatePath('/members')
  revalidatePath('/profile')

  return { success: true as const }
}

export async function requestMemberIntro(targetMemberId: string) {
  const gate = await assertMessagingAllowed()
  if (!gate.ok) {
    return { error: gate.error }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in.' }
  }

  if (user.id === targetMemberId) {
    return { error: 'You cannot request an intro to yourself.' }
  }

  const { error } = await supabase.from('member_intro_requests').insert({
    requester_id: user.id,
    target_member_id: targetMemberId,
    kind: 'member',
    status: 'pending',
  })

  if (error) {
    if (error.code === '42P01') {
      return {
        error:
          'Intro requests are not available yet. Run the latest database migration.',
      }
    }
    return { error: error.message }
  }

  revalidatePath('/members')
  revalidatePath(`/members/${targetMemberId}`)

  return { success: true as const }
}
