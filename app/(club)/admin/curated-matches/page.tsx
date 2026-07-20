import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import AdminCuratedBatchHistory from '@/components/admin/admin-curated-batch-history'
import AdminCuratedMatchGenerationPanel from '@/components/admin/admin-curated-match-generation'
import PageHeader from '@/components/ui/page-header'
import { generationIntervalDays } from '@/lib/compatibility/generation-config'
import { countScheduledDeliveryRecipients } from '@/lib/compatibility/run-scheduled-match-delivery'
import { isCompatibilityFeatureEnabled } from '@/lib/compatibility/eligibility'
import {
  loadCuratedBatchHistory,
  loadCuratedBatchHistorySummary,
} from '@/lib/load-curated-batch-history'
import { createClient } from '@/lib/supabase/server'
import { requireAdminClient } from '@/lib/supabase/require-admin-client'
import { getViewer } from '@/lib/viewer'

type SearchParams = Promise<{
  tab?: string
  status?: string
  source?: string
  recipient?: string
}>

export default async function AdminCuratedMatchesPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const viewer = await getViewer()

  if (!viewer) {
    redirect('/login')
  }

  if (viewer.role !== 'admin') {
    redirect('/home')
  }

  const params = await searchParams
  const activeTab = params.tab === 'history' ? 'history' : 'delivery'

  const supabase = requireAdminClient()
  const { dueCount, eligibleCount, poolSize, error } =
    await countScheduledDeliveryRecipients(supabase)

  const historyFilters = {
    status: params.status?.trim() || undefined,
    generationSource: params.source?.trim() || undefined,
    recipientId: params.recipient?.trim() || undefined,
    limit: 50,
  }

  const [{ items: historyItems, error: historyError }, historySummary] =
    await Promise.all([
      loadCuratedBatchHistory(supabase, historyFilters),
      loadCuratedBatchHistorySummary(supabase),
    ])

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Curated match generation"
        description="Recurring delivery, manual overrides, and batch history for curated match operations."
      />

      <div className="mb-6 flex flex-wrap gap-3 text-sm">
        <Link
          href="/admin/curated-intros"
          className="font-medium text-accent underline"
        >
          Curated intro requests
        </Link>
        <Link
          href="/admin/applications"
          className="text-muted-foreground underline"
        >
          Application queue
        </Link>
        <Link
          href="/admin/message-reports"
          className="text-muted-foreground underline"
        >
          Message reports
        </Link>
        <Link
          href="/admin/moderation-actions"
          className="text-muted-foreground underline"
        >
          Moderation audit
        </Link>
        <Link href="/admin/users" className="text-muted-foreground underline">
          Manage roles
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap gap-3 border-b border-border pb-3 text-sm">
        <Link
          href="/admin/curated-matches"
          className={
            activeTab === 'delivery'
              ? 'font-medium text-accent underline'
              : 'text-muted-foreground underline'
          }
        >
          Delivery controls
        </Link>
        <Link
          href="/admin/curated-matches?tab=history"
          className={
            activeTab === 'history'
              ? 'font-medium text-accent underline'
              : 'text-muted-foreground underline'
          }
        >
          Delivery history
        </Link>
      </div>

      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}

      {activeTab === 'delivery' ? (
        <AdminCuratedMatchGenerationPanel
          dueCount={dueCount}
          eligibleRecipientCount={eligibleCount}
          poolSize={poolSize}
          featureEnabled={isCompatibilityFeatureEnabled()}
          generationIntervalDays={generationIntervalDays()}
        />
      ) : (
        <>
          {historyError ? (
            <p className="mb-4 text-sm text-danger">{historyError}</p>
          ) : null}
          <Suspense
            fallback={<p className="text-sm text-muted-foreground">Loading…</p>}
          >
            <AdminCuratedBatchHistory
              items={historyItems}
              summary={historySummary}
              filters={{
                status: params.status ?? '',
                generationSource: params.source ?? '',
                recipientId: params.recipient ?? '',
              }}
            />
          </Suspense>
        </>
      )}
    </>
  )
}
