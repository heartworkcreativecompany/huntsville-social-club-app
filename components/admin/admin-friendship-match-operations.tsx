'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { refreshFriendshipRecommendationsAction } from '@/app/(club)/admin/curated-matches/actions'
import Card from '@/components/ui/card'
import { buttonPrimaryClassName } from '@/lib/event-labels'
import {
  FRIENDSHIP_ADMIN_HEADING,
  FRIENDSHIP_NO_EMAIL_COPY,
  FRIENDSHIP_REFRESH_BUTTON_LABEL,
  FRIENDSHIP_REFRESH_CONFIRMATION,
  FRIENDSHIP_REFRESH_DISABLED_COPY,
  confirmedFriendshipRefresh,
  type AdminFriendshipMatchOperations,
  type AdminFriendshipRefreshResult,
} from '@/lib/friendship/load-admin-match-operations'

function formatTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export default function AdminFriendshipMatchOperationsPanel({
  operations,
}: {
  operations: AdminFriendshipMatchOperations
}) {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const [result, setResult] = useState<AdminFriendshipRefreshResult | null>(null)
  const [isPending, startTransition] = useTransition()

  const runRefresh = () => {
    setMessage('')
    setResult(null)

    const confirmed = window.confirm(FRIENDSHIP_REFRESH_CONFIRMATION)
    if (!confirmedFriendshipRefresh(confirmed)) {
      return
    }

    startTransition(async () => {
      const response = await refreshFriendshipRecommendationsAction()
      if ('error' in response && response.error) {
        setMessage(response.error)
        return
      }
      if (!('result' in response) || !response.result) {
        setMessage('Friendship refresh finished without a summary.')
        return
      }
      setResult(response.result)
      setMessage(
        `Refreshed Friendship recommendations for ${response.result.considered} eligible members. ${response.result.recommendationsWritten} recommendations written. No email sent.`
      )
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-display text-lg font-semibold">{FRIENDSHIP_ADMIN_HEADING}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{FRIENDSHIP_NO_EMAIL_COPY}</p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Friendship matching
            </dt>
            <dd className="mt-1 font-medium text-foreground">
              {operations.matchingEnabled ? 'Enabled' : 'Disabled'}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Submitted Friendship questionnaires
            </dt>
            <dd className="mt-1 text-foreground">{operations.submittedQuestionnaireCount}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Eligible friend-match pool
            </dt>
            <dd className="mt-1 text-foreground">{operations.eligiblePoolCount}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Most recent Friendship batch
            </dt>
            <dd className="mt-1 text-foreground">
              {operations.latestBatch
                ? `${formatTimestamp(operations.latestBatch.createdAt)} · ${operations.latestBatch.status} · ${operations.latestBatch.recommendationCount} recommendations`
                : 'No batches yet'}
            </dd>
          </div>
        </dl>
      </Card>

      <Card>
        <h2 className="text-display text-lg font-semibold">Last 30 days</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Batches
            </dt>
            <dd className="mt-1 text-foreground">{operations.last30Days.batchCount}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Batches with recommendations
            </dt>
            <dd className="mt-1 text-foreground">{operations.last30Days.deliveredCount}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Empty batches
            </dt>
            <dd className="mt-1 text-foreground">{operations.last30Days.emptyCount}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Recommendations written
            </dt>
            <dd className="mt-1 text-foreground">
              {operations.last30Days.recommendationsWritten}
            </dd>
          </div>
        </dl>
      </Card>

      <Card>
        <h2 className="text-display text-lg font-semibold">
          {FRIENDSHIP_REFRESH_BUTTON_LABEL}
        </h2>
        {operations.matchingEnabled ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Rebuilds in-app Friendship recommendations for every member currently in
            the eligible pool. {FRIENDSHIP_NO_EMAIL_COPY}
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            {FRIENDSHIP_REFRESH_DISABLED_COPY}
          </p>
        )}
        <button
          type="button"
          disabled={!operations.matchingEnabled || isPending}
          onClick={runRefresh}
          className={`${buttonPrimaryClassName} mt-4`}
        >
          {isPending ? 'Refreshing…' : FRIENDSHIP_REFRESH_BUTTON_LABEL}
        </button>
      </Card>

      <Card>
        <h2 className="text-display text-lg font-semibold">Recent Friendship batches</h2>
        {operations.recentBatches.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No Friendship batches yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border text-sm">
            {operations.recentBatches.map((batch) => (
              <li
                key={`${batch.created_at}-${batch.status}-${batch.match_count}`}
                className="flex flex-wrap justify-between gap-2 py-2 text-foreground"
              >
                <span>{formatTimestamp(batch.created_at)}</span>
                <span>{batch.status}</span>
                <span>{batch.match_count} recommendations</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {message ? <p className="text-sm text-foreground">{message}</p> : null}

      {result ? (
        <Card padding="sm">
          <h3 className="text-sm font-semibold text-foreground">Last Friendship refresh</h3>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            <li>Considered: {result.considered}</li>
            <li>Processed: {result.processed}</li>
            <li>With recommendations: {result.delivered}</li>
            <li>Empty: {result.empty}</li>
            <li>Skipped: {result.skipped}</li>
            <li>Recommendations written: {result.recommendationsWritten}</li>
          </ul>
        </Card>
      ) : null}
    </div>
  )
}
