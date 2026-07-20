import { NextResponse } from 'next/server'
import { isCompatibilityFeatureEnabled } from '@/lib/compatibility/eligibility'
import { runScheduledCuratedMatchDelivery } from '@/lib/compatibility/run-scheduled-match-delivery'
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

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isCompatibilityFeatureEnabled()) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'Compatibility matching is disabled.',
    })
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

  const summary = await runScheduledCuratedMatchDelivery(admin)

  if (summary.error) {
    return NextResponse.json({ error: summary.error }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    dueCount: summary.dueCount,
    processed: summary.processed,
    delivered: summary.delivered,
    empty: summary.empty,
    skipped: summary.skipped,
    recommendationsCreated: summary.recommendationsCreated,
    notificationsSent: summary.notificationsSent,
  })
}
