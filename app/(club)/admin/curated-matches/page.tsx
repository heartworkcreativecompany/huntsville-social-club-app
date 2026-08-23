import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import AdminCuratedBatchHistory from '@/components/admin/admin-curated-batch-history'
import AdminCuratedMatchGenerationPanel from '@/components/admin/admin-curated-match-generation'
import AdminFriendshipMatchOperationsPanel from '@/components/admin/admin-friendship-match-operations'
import PageHeader from '@/components/ui/page-header'
import { generationIntervalDays } from '@/lib/compatibility/generation-config'
import { countScheduledDeliveryRecipients } from '@/lib/compatibility/run-scheduled-match-delivery'
import { isCompatibilityFeatureEnabled } from '@/lib/compatibility/eligibility'
import {
  loadAdminFriendshipMatchOperations,
  resolveDatingDeliveryTab,
  resolveMatchOperationsProduct,
} from '@/lib/friendship/load-admin-match-operations'
import {
  loadCuratedBatchHistory,
  loadCuratedBatchHistorySummary,
} from '@/lib/load-curated-batch-history'
import { requireAdminClient } from '@/lib/supabase/require-admin-client'
import { getViewer } from '@/lib/viewer'

type SearchParams = Promise<{
  product?: string
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
  const product = resolveMatchOperationsProduct(params.product)
  const activeTab = resolveDatingDeliveryTab(params.tab)
  const supabase = requireAdminClient()

  if (product === 'friendship') {
    const loaded = await loadAdminFriendshipMatchOperations(supabase, { isAdmin: true })

    return (
      <>
        <PageHeader
          eyebrow="Operations"
          title="Match operations"
          description="Dating curated delivery and Friendship recommendation refresh are separate products with separate feature flags."
        />
        <ProductTabs product={product} />
        {loaded.ok ? (
          <AdminFriendshipMatchOperationsPanel operations={loaded.data} />
        ) : (
          <p className="text-sm text-danger">{loaded.error}</p>
        )}
      </>
    )
  }

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
        title="Match operations"
        description="Dating curated delivery, manual overrides, and Dating batch history. Friendship refresh lives on the Friendship Matches tab."
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

      <ProductTabs product={product} />

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

function ProductTabs({ product }: { product: 'dating' | 'friendship' }) {
  return (
    <div className="mb-6 flex flex-wrap gap-3 border-b border-border pb-3 text-sm">
      <Link
        href="/admin/curated-matches"
        className={
          product === 'dating'
            ? 'font-medium text-accent underline'
            : 'text-muted-foreground underline'
        }
      >
        Dating Matches
      </Link>
      <Link
        href="/admin/curated-matches?product=friendship"
        className={
          product === 'friendship'
            ? 'font-medium text-accent underline'
            : 'text-muted-foreground underline'
        }
      >
        Friendship Matches
      </Link>
    </div>
  )
}
