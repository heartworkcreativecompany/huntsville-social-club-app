'use server'

import { revalidatePath } from 'next/cache'
import { getViewer } from '@/lib/viewer'
import { requireAdminClient } from '@/lib/supabase/require-admin-client'
import { revalidateFriendshipRoutes } from '@/lib/friendship/revalidate-routes'
import {
  executeAdminFriendshipRefresh,
  isAdminViewer,
} from '@/lib/friendship/load-admin-match-operations'
import { revalidateCuratedMatchMemberRoutes } from '@/lib/compatibility/revalidate-curated-match-routes'
import {
  generateCuratedRecommendationsForAllEligible,
  generateCuratedRecommendationsForUser,
} from '@/lib/compatibility/generate-recommendations'
import { runScheduledCuratedMatchDelivery } from '@/lib/compatibility/run-scheduled-match-delivery'
import { isCompatibilityFeatureEnabled } from '@/lib/compatibility/eligibility'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in.', userId: null as string | null }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return { error: 'Administrator access required.', userId: null }
  }

  return { error: null, userId: user.id }
}

function adminWriteClient() {
  const admin = createAdminClient()
  if (!admin) {
    return {
      error:
        'SUPABASE_SERVICE_ROLE_KEY is required for curated match generation.',
      admin: null,
    }
  }
  return { error: null, admin }
}

function revalidateMatchPaths() {
  revalidateCuratedMatchMemberRoutes({
    adminCuratedMatches: true,
    adminCuratedIntros: true,
  })
}

export async function runScheduledCuratedMatchDeliveryAction() {
  const auth = await requireAdmin()
  if (auth.error) {
    return { error: auth.error }
  }

  if (!isCompatibilityFeatureEnabled()) {
    return {
      error:
        'Set COMPATIBILITY_MATCHING_ENABLED=true before generating recommendations.',
    }
  }

  const client = adminWriteClient()
  if (client.error || !client.admin) {
    return { error: client.error ?? 'Admin client unavailable.' }
  }

  const summary = await runScheduledCuratedMatchDelivery(client.admin)
  if (summary.error) {
    return { error: summary.error }
  }

  revalidateMatchPaths()

  return { success: true as const, summary }
}

export async function runCuratedMatchGenerationForAll() {
  const auth = await requireAdmin()
  if (auth.error) {
    return { error: auth.error }
  }

  if (!isCompatibilityFeatureEnabled()) {
    return {
      error:
        'Set COMPATIBILITY_MATCHING_ENABLED=true before generating recommendations.',
    }
  }

  const client = adminWriteClient()
  if (client.error || !client.admin) {
    return { error: client.error ?? 'Admin client unavailable.' }
  }

  const summary = await generateCuratedRecommendationsForAllEligible(
    client.admin,
    { generationSource: 'manual_all' }
  )
  if (summary.error) {
    return { error: summary.error }
  }

  revalidateMatchPaths()

  return { success: true as const, summary }
}

export async function runCuratedMatchGenerationForMember(input: {
  memberId: string
}) {
  const auth = await requireAdmin()
  if (auth.error) {
    return { error: auth.error }
  }

  if (!isCompatibilityFeatureEnabled()) {
    return {
      error:
        'Set COMPATIBILITY_MATCHING_ENABLED=true before generating recommendations.',
    }
  }

  const memberId = input.memberId.trim()
  if (!memberId) {
    return { error: 'Member ID is required.' }
  }

  const client = adminWriteClient()
  if (client.error || !client.admin) {
    return { error: client.error ?? 'Admin client unavailable.' }
  }

  try {
    const result = await generateCuratedRecommendationsForUser(
      client.admin,
      memberId,
      { generationSource: 'manual_member' }
    )
    revalidateMatchPaths()
    revalidateCuratedMatchMemberRoutes({ memberId })

    return { success: true as const, result }
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Failed to generate recommendations.',
    }
  }
}


export async function refreshFriendshipRecommendationsAction() {
  const viewer = await getViewer()
  if (!isAdminViewer(viewer)) {
    return { error: 'Administrator access required.' }
  }

  let admin
  try {
    admin = requireAdminClient()
  } catch {
    return { error: 'Administrator database access is unavailable.' }
  }

  const outcome = await executeAdminFriendshipRefresh({
    isAdmin: true,
    supabase: admin,
  })

  if (!outcome.ok) {
    return { error: outcome.error }
  }

  revalidateFriendshipRoutes()
  revalidatePath('/admin/curated-matches')
  revalidatePath('/friendship/matches')

  return { success: true as const, result: outcome.result }
}
