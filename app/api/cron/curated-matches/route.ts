import { NextResponse } from 'next/server'
import { expireDueConnectHoldoverMatching } from '@/lib/compatibility/expire-connect-holdover-matching'
import { isCompatibilityFeatureEnabled } from '@/lib/compatibility/eligibility'
import { runScheduledCuratedMatchDelivery } from '@/lib/compatibility/run-scheduled-match-delivery'
import { refreshFriendshipRecommendationsForAllEligible } from '@/lib/friendship/generate-recommendations'
import { friendshipCronShouldRefresh } from '@/lib/friendship/matching-flag'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

function isAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return false
  }

  const authHeader = request.headers.get('authorization')
  return authHeader === `Bearer ${cronSecret}`
}

async function runFriendshipRefresh(
  admin: NonNullable<ReturnType<typeof createAdminClient>>
) {
  const plan = friendshipCronShouldRefresh()
  if (!plan.refresh) {
    return {
      processed: 0,
      delivered: 0,
      empty: 0,
      skipped: 0,
      skippedMatching: true,
      reason: plan.reason,
      error: null as string | null,
    }
  }

  try {
    return {
      ...(await refreshFriendshipRecommendationsForAllEligible(admin)),
      skippedMatching: false,
      reason: null as string | null,
      error: null as string | null,
    }
  } catch (error) {
    return {
      processed: 0,
      delivered: 0,
      empty: 0,
      skipped: 0,
      skippedMatching: false,
      reason: null as string | null,
      error: error instanceof Error ? error.message : 'Friendship refresh failed.',
    }
  }
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json(
      {
        error:
          'SUPABASE_SERVICE_ROLE_KEY is required for scheduled match delivery.',
      },
      { status: 500 }
    )
  }

  const holdoverExpiry = await expireDueConnectHoldoverMatching(admin)
  const friendship = await runFriendshipRefresh(admin)

  if (!isCompatibilityFeatureEnabled()) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'Compatibility matching is disabled.',
      holdoverExpiry,
      friendship,
    })
  }

  const summary = await runScheduledCuratedMatchDelivery(admin)

  if (summary.error) {
    return NextResponse.json(
      { error: summary.error, holdoverExpiry, friendship },
      { status: 500 }
    )
  }

  return NextResponse.json({
    ok: true,
    holdoverExpiry,
    dueCount: summary.dueCount,
    processed: summary.processed,
    delivered: summary.delivered,
    empty: summary.empty,
    skipped: summary.skipped,
    recommendationsCreated: summary.recommendationsCreated,
    notificationsSent: summary.notificationsSent,
    friendship,
  })
}
