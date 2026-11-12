'use server'

import { revalidatePath } from 'next/cache'
import { adminRemovalFollowUp } from '@/lib/member-removal'
import { buildRemovalDeps } from '@/lib/member-removal-db'
import {
  executeMemberRestore,
  executePermanentRemoval,
  publicRemovalResult,
} from '@/lib/member-removal-run'
import { MEMBER_PROFILES_VIEW } from '@/lib/member-profiles-view'
import {
  grantMembershipAccessOverride,
  revokeMembershipAccessOverride,
} from '@/lib/membership-access-override/admin'
import {
  awardRecognitionBadges,
  revokeRecognitionBadge,
} from '@/lib/recognition-badges/admin'
import { createClient } from '@/lib/supabase/server'
import { requireAdminClient } from '@/lib/supabase/require-admin-client'
import { publicMemberDisplayRevalidatePaths } from '@/lib/public-member-badges'

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

function revalidateMemberAdminPaths(memberId: string) {
  revalidatePath('/admin/users')
  revalidatePath(`/admin/users/${memberId}`)
  revalidatePath(`/admin/users/${memberId}/badges`)
  revalidatePath('/members', 'layout')
  revalidatePath(`/members/${memberId}`, 'page')
  revalidatePath('/profile', 'layout')
  for (const path of publicMemberDisplayRevalidatePaths(memberId)) {
    revalidatePath(path)
  }
}

export async function awardMemberRecognitionBadgesAction(input: {
  memberId: string
  slugs: string[]
  adminNote?: string | null
}) {
  const auth = await requireAdmin()
  if (auth.error || !auth.userId) {
    return { error: auth.error ?? 'Administrator access required.' }
  }

  const result = await awardRecognitionBadges(requireAdminClient(), {
    isAdmin: true,
    actorId: auth.userId,
    memberId: input.memberId,
    slugs: input.slugs,
    adminNote: input.adminNote,
  })

  if (!result.ok) {
    return { error: result.error }
  }

  revalidateMemberAdminPaths(input.memberId)
  return {
    success: true as const,
    awarded: result.awarded,
    alreadyAwarded: result.alreadyAwarded,
  }
}

export async function revokeMemberRecognitionBadgeAction(input: {
  memberId: string
  slug: string
}) {
  const auth = await requireAdmin()
  if (auth.error || !auth.userId) {
    return { error: auth.error ?? 'Administrator access required.' }
  }

  const result = await revokeRecognitionBadge(requireAdminClient(), {
    isAdmin: true,
    actorId: auth.userId,
    memberId: input.memberId,
    slug: input.slug,
  })

  if (!result.ok) {
    return { error: result.error }
  }

  revalidateMemberAdminPaths(input.memberId)
  return { success: true as const, revoked: result.revoked }
}

export async function grantMembershipAccessOverrideAction(input: {
  memberId: string
  tier: string
  expiresAt?: string | null
  reason?: string | null
}) {
  const auth = await requireAdmin()
  if (auth.error || !auth.userId) {
    return { error: auth.error ?? 'Administrator access required.' }
  }

  const result = await grantMembershipAccessOverride(requireAdminClient(), {
    isAdmin: true,
    actorId: auth.userId,
    memberId: input.memberId,
    tier: input.tier,
    expiresAt: input.expiresAt,
    reason: input.reason,
  })

  if (!result.ok) {
    return { error: result.error }
  }

  revalidateMemberAdminPaths(input.memberId)
  return {
    success: true as const,
    granted: result.granted,
    updated: result.updated,
    alreadyActive: result.alreadyActive,
  }
}

export async function revokeMembershipAccessOverrideAction(input: {
  memberId: string
}) {
  const auth = await requireAdmin()
  if (auth.error || !auth.userId) {
    return { error: auth.error ?? 'Administrator access required.' }
  }

  const result = await revokeMembershipAccessOverride(requireAdminClient(), {
    isAdmin: true,
    actorId: auth.userId,
    memberId: input.memberId,
  })

  if (!result.ok) {
    return { error: result.error }
  }

  revalidateMemberAdminPaths(input.memberId)
  return { success: true as const, revoked: result.revoked }
}

function revalidateRemovalSurfaces(memberId: string) {
  revalidateMemberAdminPaths(memberId)
  revalidatePath('/members', 'layout')
  revalidatePath('/messages', 'layout')
  revalidatePath('/matches', 'layout')
  revalidatePath('/events', 'layout')
}

export async function permanentlyRemoveMemberAction(input: {
  memberId: string
  category: string
  internalNote: string
  confirmationText: string
}) {
  const auth = await requireAdmin()
  if (auth.error || !auth.userId) {
    return { error: auth.error ?? 'Administrator access required.' }
  }

  const result = await executePermanentRemoval(
    {
      actorIsAdmin: true,
      actorId: auth.userId,
      targetUserId: input.memberId,
      category: input.category,
      internalNote: input.internalNote,
      confirmationText: input.confirmationText,
    },
    buildRemovalDeps(requireAdminClient(), auth.userId)
  )

  if (!result.ok) return { error: result.error }

  revalidateRemovalSurfaces(input.memberId)
  const safe = publicRemovalResult(result)
  return {
    success: true as const,
    paidTickets: safe.paidTickets,
    followUp: adminRemovalFollowUp(safe),
  }
}

export async function restoreRemovedMemberAction(input: {
  memberId: string
  note: string
  confirmationText: string
}) {
  const auth = await requireAdmin()
  if (auth.error || !auth.userId) {
    return { error: auth.error ?? 'Administrator access required.' }
  }

  const result = await executeMemberRestore(
    {
      actorIsAdmin: true,
      actorId: auth.userId,
      targetUserId: input.memberId,
      note: input.note,
      confirmationText: input.confirmationText,
    },
    buildRemovalDeps(requireAdminClient(), auth.userId)
  )

  if (!result.ok) return { error: result.error }

  revalidateRemovalSurfaces(input.memberId)
  return { success: true as const }
}
