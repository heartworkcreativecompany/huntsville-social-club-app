'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAdminClient } from '@/lib/supabase/require-admin-client'
import {
  approveInPersonIdentity,
  revokeInPersonIdentity,
} from '@/lib/identity-verification-admin'

async function requireAdminActor() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') return null
  return user.id
}

export async function approveInPersonIdentityVerification(
  profileId: string,
  note?: string
) {
  const actorId = await requireAdminActor()
  if (!actorId) {
    return { error: 'Administrator access required.' }
  }

  const result = await approveInPersonIdentity(requireAdminClient(), {
    isAdmin: true,
    actorId,
    profileId,
    note,
  })
  if (!result.ok) return { error: result.error }

  revalidatePath(`/admin/applications/${profileId}`)
  revalidatePath('/application/status')
  return { success: true as const, alreadyVerified: result.alreadyVerified }
}

export async function revokeInPersonIdentityVerification(profileId: string) {
  const actorId = await requireAdminActor()
  if (!actorId) {
    return { error: 'Administrator access required.' }
  }

  const result = await revokeInPersonIdentity(requireAdminClient(), {
    isAdmin: true,
    actorId,
    profileId,
  })
  if (!result.ok) return { error: result.error }

  revalidatePath(`/admin/applications/${profileId}`)
  revalidatePath('/application/status')
  return { success: true as const }
}
