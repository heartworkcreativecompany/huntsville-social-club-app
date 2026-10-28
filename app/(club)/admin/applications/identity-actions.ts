'use server'

import { revalidatePath } from 'next/cache'
import { publicMemberDisplayRevalidatePaths } from '@/lib/public-member-badges'
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

function revalidateIdentitySurfaces(profileId: string) {
  revalidatePath(`/admin/applications/${profileId}`)
  revalidatePath('/application/status')
  revalidatePath('/messages')
  revalidatePath('/profile')
  revalidatePath('/dashboard')
  for (const path of publicMemberDisplayRevalidatePaths(profileId)) {
    revalidatePath(path)
  }
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

  revalidateIdentitySurfaces(profileId)
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

  revalidateIdentitySurfaces(profileId)
  return { success: true as const }
}
