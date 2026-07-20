'use server'

import { revalidatePath } from 'next/cache'
import { removeMemberAccount } from '@/lib/admin/delete-member'
import { MEMBER_PROFILES_VIEW } from '@/lib/member-profiles-view'
import { createClient } from '@/lib/supabase/server'
import { requireAdminClient } from '@/lib/supabase/require-admin-client'

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in.', userId: null as string | null }
  }

  const { data: profile } = await supabase
    .from(MEMBER_PROFILES_VIEW)
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return { error: 'Administrator access required.', userId: null }
  }

  return { error: null, userId: user.id }
}

export async function removeMember(input: {
  targetUserId: string
  confirmationText: string
}) {
  const auth = await requireAdmin()
  if (auth.error || !auth.userId) {
    return { error: auth.error ?? 'Unauthorized' }
  }

  const admin = requireAdminClient()
  const { data: target, error } = await admin
    .from('profiles')
    .select(
      'id, email, full_name, role, application_draft, membership_billing'
    )
    .eq('id', input.targetUserId)
    .maybeSingle()

  if (error) {
    return { error: error.message }
  }

  const result = await removeMemberAccount({
    actorId: auth.userId,
    targetUserId: input.targetUserId,
    confirmationText: input.confirmationText,
    target: target ?? {
      id: input.targetUserId,
      email: null,
      full_name: null,
      role: null,
      application_draft: null,
      membership_billing: null,
    },
  })

  if (!result.success) {
    return { error: result.error }
  }

  revalidatePath('/admin/users')
  revalidatePath('/admin/applications')
  revalidatePath(`/admin/applications/${input.targetUserId}`)
  revalidatePath('/members')

  return { success: true as const }
}
