import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidateFriendshipRoutes } from '@/lib/friendship/revalidate-routes'
import { isFriendshipMatchingEnabled } from '@/lib/friendship/eligibility'
import {
  refreshFriendshipRecommendationsForUser,
  rescoreFriendshipRecommendationsInvolving,
} from '@/lib/friendship/generate-recommendations'

export async function tryRefreshFriendshipRecommendations(userId: string): Promise<void> {
  if (!isFriendshipMatchingEnabled()) {
    return
  }

  const admin = createAdminClient()
  if (!admin) {
    console.info(
      '[friendship-matches]',
      'Recommendation refresh skipped; matching service is not configured.'
    )
    return
  }

  try {
    const result = await refreshFriendshipRecommendationsForUser(admin, userId)
    await rescoreFriendshipRecommendationsInvolving(admin, userId)
    console.info('[friendship-matches]', {
      outcome: result.outcome,
      created: result.created,
    })
    if (result.outcome === 'delivered' || result.outcome === 'empty') {
      revalidateFriendshipRoutes()
    }
  } catch {
    console.error('[friendship-matches]', 'Recommendation refresh failed.')
  }
}

export function queueFriendshipRecommendationRefresh(userId: string): void {
  void tryRefreshFriendshipRecommendations(userId)
}
