'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useTransition } from 'react'
import Badge from '@/components/ui/badge'
import {
  CURATED_BATCH_GENERATION_SOURCES,
  curatedBatchGenerationSourceLabel,
  curatedBatchNotificationStatusLabel,
  curatedBatchStatusLabel,
} from '@/lib/compatibility/batch-generation-source'
import { inputClassName } from '@/lib/event-labels'
import type { CuratedBatchHistoryItem } from '@/lib/load-curated-batch-history'

function statusBadgeVariant(
  status: string
): 'accent' | 'success' | 'muted' | 'warning' {
  switch (status) {
    case 'delivered':
      return 'success'
    case 'empty':
      return 'warning'
    case 'processing':
      return 'accent'
    case 'cancelled':
      return 'muted'
    default:
      return 'accent'
  }
}

function notificationBadgeVariant(
  status: string | null
): 'accent' | 'success' | 'muted' | 'warning' {
  switch (status) {
    case 'sent':
      return 'success'
    case 'failed':
      return 'warning'
    default:
      return 'muted'
  }
}

export default function AdminCuratedBatchHistory({
  items,
  summary,
  filters,
}: {
  items: CuratedBatchHistoryItem[]
  summary: {
    totalRecent: number
    deliveredRecent: number
    emptyRecent: number
    notificationsSentRecent: number
  }
  filters: {
    status: string
    generationSource: string
    recipientId: string
  }
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const applyFilters = (formData: FormData) => {
    const params = new URLSearchParams(searchParams.get('tab') ? { tab: 'history' } : {})
    if (!params.get('tab')) {
      params.set('tab', 'history')
    }

    const status = String(formData.get('status') ?? '').trim()
    const source = String(formData.get('generationSource') ?? '').trim()
    const recipient = String(formData.get('recipientId') ?? '').trim()

    if (status) params.set('status', status)
    if (source) params.set('source', source)
    if (recipient) params.set('recipient', recipient)

    startTransition(() => {
      router.push(`/admin/curated-matches?${params.toString()}`)
    })
  }

  const clearFilters = () => {
    startTransition(() => {
      router.push('/admin/curated-matches?tab=history')
    })
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Last 30 days
          </p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {summary.totalRecent}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Total batches</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Delivered
          </p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {summary.deliveredRecent}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">With recommendations</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Empty
          </p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {summary.emptyRecent}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">No viable matches</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Emails sent
          </p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {summary.notificationsSentRecent}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Delivery notifications</p>
        </div>
      </div>

      <form
        action={applyFilters}
        className="rounded-xl border border-border bg-card p-4 shadow-sm"
      >
        <p className="text-sm font-medium text-foreground">Filter delivery history</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Status
            </span>
            <select
              name="status"
              defaultValue={filters.status}
              className={inputClassName}
            >
              <option value="">All statuses</option>
              <option value="delivered">Delivered</option>
              <option value="empty">Empty</option>
              <option value="processing">Processing</option>
              <option value="scheduled">Scheduled</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Source
            </span>
            <select
              name="generationSource"
              defaultValue={filters.generationSource}
              className={inputClassName}
            >
              <option value="">All sources</option>
              {CURATED_BATCH_GENERATION_SOURCES.map((source) => (
                <option key={source} value={source}>
                  {curatedBatchGenerationSourceLabel(source)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Recipient member ID
            </span>
            <input
              name="recipientId"
              defaultValue={filters.recipientId}
              placeholder="UUID"
              className={inputClassName}
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground"
          >
            {isPending ? 'Applying…' : 'Apply filters'}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={clearFilters}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground"
          >
            Clear
          </button>
        </div>
      </form>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No delivery batches match the current filters.
        </p>
      ) : (
        <ul className="space-y-4">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-xl border border-border bg-card p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={statusBadgeVariant(item.status)}>
                      {curatedBatchStatusLabel(item.status)}
                    </Badge>
                    <Badge variant="muted">
                      {curatedBatchGenerationSourceLabel(item.generationSource)}
                    </Badge>
                    {item.notificationStatus ? (
                      <Badge variant={notificationBadgeVariant(item.notificationStatus)}>
                        {curatedBatchNotificationStatusLabel(item.notificationStatus)}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Created {new Date(item.createdAt).toLocaleString()}
                    {item.deliveredAt ? (
                      <span>
                        {' '}
                        · Delivered {new Date(item.deliveredAt).toLocaleString()}
                      </span>
                    ) : null}
                  </p>
                </div>
                <p className="text-sm font-medium text-foreground">
                  {item.matchCount} recommendation{item.matchCount === 1 ? '' : 's'}
                </p>
              </div>

              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Recipient
                  </dt>
                  <dd className="mt-1">
                    <Link
                      href={`/members/${item.recipient.id}`}
                      className="font-medium text-accent underline"
                    >
                      {item.recipient.name}
                    </Link>
                    {item.recipient.email ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.recipient.email}
                      </p>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Batch ID
                  </dt>
                  <dd className="mt-1 break-all font-mono text-xs text-muted-foreground">
                    {item.id}
                  </dd>
                </div>
              </dl>

              {item.status === 'empty' ? (
                <div className="mt-4 rounded-lg border border-border bg-surface/50 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Empty batch explanation
                  </p>
                  <p className="mt-2 text-sm text-foreground">
                    {item.emptyReason ?? 'No explanation recorded for this batch.'}
                  </p>
                  {item.topCandidateScore != null ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Best available score: {Math.round(item.topCandidateScore)}%
                    </p>
                  ) : null}
                </div>
              ) : null}

              {item.cancellationReason ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Cancelled:</span>{' '}
                  {item.cancellationReason}
                </p>
              ) : null}

              {item.recommendations.length > 0 ? (
                <details className="mt-4 rounded-lg border border-border bg-surface/50 p-3">
                  <summary className="cursor-pointer text-sm font-medium text-foreground">
                    Recommendations in this batch ({item.recommendations.length})
                  </summary>
                  <ul className="mt-3 space-y-3">
                    {item.recommendations.map((recommendation) => (
                      <li
                        key={recommendation.id}
                        className="border-l-2 border-border pl-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Link
                            href={`/members/${recommendation.recommendedUserId}`}
                            className="font-medium text-accent underline"
                          >
                            {recommendation.recommendedName}
                          </Link>
                          <span className="text-sm text-muted-foreground">
                            {Math.round(recommendation.compatibilityScore)}% ·{' '}
                            {recommendation.status}
                          </span>
                        </div>
                        {recommendation.scoreSummary.length > 0 ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {recommendation.scoreSummary.join(' · ')}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
