'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  runCuratedMatchGenerationForAll,
  runCuratedMatchGenerationForMember,
  runScheduledCuratedMatchDeliveryAction,
} from '@/app/(club)/admin/curated-matches/actions'
import Card from '@/components/ui/card'
import {
  buttonPrimaryClassName,
  buttonSecondaryClassName,
  inputClassName,
} from '@/lib/event-labels'
import {
  MIN_COMPATIBILITY_SCORE,
  RECOMMENDATIONS_PER_BATCH,
} from '@/lib/compatibility/generation-config'
import type { ScheduledDeliverySummary } from '@/lib/compatibility/run-scheduled-match-delivery'
import type { BatchGenerationSummary } from '@/lib/compatibility/generate-recommendations'

export default function AdminCuratedMatchGenerationPanel({
  dueCount,
  eligibleRecipientCount,
  poolSize,
  featureEnabled,
  generationIntervalDays,
}: {
  dueCount: number
  eligibleRecipientCount: number
  poolSize: number
  featureEnabled: boolean
  generationIntervalDays: number
}) {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const [summary, setSummary] = useState<
    ScheduledDeliverySummary | BatchGenerationSummary | null
  >(null)
  const [memberId, setMemberId] = useState('')
  const [isPending, startTransition] = useTransition()

  const runScheduled = () => {
    setMessage('')
    setSummary(null)

    const confirmed = window.confirm(
      `Run scheduled delivery for ${dueCount} due member${dueCount === 1 ? '' : 's'}? Members outside the ${generationIntervalDays}-day generation window will be skipped.`
    )
    if (!confirmed) return

    startTransition(async () => {
      const result = await runScheduledCuratedMatchDeliveryAction()
      if (result.error) {
        setMessage(result.error)
        return
      }

      if (!result.summary) {
        setMessage('Delivery finished without a summary.')
        return
      }

      setSummary(result.summary)
      setMessage(
        `Delivered ${result.summary.recommendationsCreated} recommendations across ${result.summary.delivered} batches. ${result.summary.notificationsSent} notification email${result.summary.notificationsSent === 1 ? '' : 's'} sent.`
      )
      router.refresh()
    })
  }

  const runForceAll = () => {
    setMessage('')
    setSummary(null)

    const confirmed = window.confirm(
      `Force-generate for all ${eligibleRecipientCount} eligible members, ignoring the ${generationIntervalDays}-day delivery window?`
    )
    if (!confirmed) return

    startTransition(async () => {
      const result = await runCuratedMatchGenerationForAll()
      if (result.error) {
        setMessage(result.error)
        return
      }

      if (!result.summary) {
        setMessage('Generation finished without a summary.')
        return
      }

      setSummary(result.summary)
      setMessage(
        `Generated ${result.summary.recommendationsCreated} recommendations across ${result.summary.delivered} delivered batches (${result.summary.empty} empty, ${result.summary.skipped} skipped). Force runs do not send delivery emails.`
      )
      router.refresh()
    })
  }

  const runSingle = () => {
    setMessage('')
    setSummary(null)

    startTransition(async () => {
      const result = await runCuratedMatchGenerationForMember({
        memberId,
      })

      if (result.error) {
        setMessage(result.error)
        return
      }

      const single = result.result
      if (!single) {
        setMessage('Generation finished without a result.')
        return
      }

      setMessage(
        single.outcome === 'delivered'
          ? `Created ${single.created} recommendations for this member.`
          : single.outcome === 'empty'
            ? 'No new recommendations met the minimum score threshold.'
            : (single.skipReason ?? 'Member skipped.')
      )
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-display text-lg font-semibold">Delivery status</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Feature flag
            </dt>
            <dd className="mt-1 font-medium text-foreground">
              {featureEnabled ? 'Enabled' : 'Disabled'}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Dating pool
            </dt>
            <dd className="mt-1 text-foreground">
              {poolSize} approved members with completed Dating questionnaires
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Eligible recipients
            </dt>
            <dd className="mt-1 text-foreground">
              {eligibleRecipientCount} active members
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Due for delivery
            </dt>
            <dd className="mt-1 text-foreground">
              {dueCount} member{dueCount === 1 ? '' : 's'} this run
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Delivery window
            </dt>
            <dd className="mt-1 text-foreground">
              Every {generationIntervalDays} days per member
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Scoring threshold
            </dt>
            <dd className="mt-1 text-foreground">
              Minimum {MIN_COMPATIBILITY_SCORE}% · up to {RECOMMENDATIONS_PER_BATCH}{' '}
              recommendations per batch
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          Production delivery runs weekly via{' '}
          <code className="text-foreground">/api/cron/curated-matches</code> when{' '}
          <code className="text-foreground">CRON_SECRET</code> is configured on
          Vercel. The same scheduled runner is available here for manual
          operations. Members who are paused, suspended, blocked, or still inside
          pair cooldowns are skipped automatically.
        </p>
      </Card>

      <Card>
        <h2 className="text-display text-lg font-semibold">
          Run scheduled delivery
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Processes only members who are due for a new batch, delivers
          recommendations, updates batch records, and emails members when a batch
          actually delivers new matches.
        </p>
        <button
          type="button"
          disabled={!featureEnabled || isPending || dueCount === 0}
          onClick={runScheduled}
          className={`${buttonPrimaryClassName} mt-4`}
        >
          {isPending ? 'Running…' : 'Run scheduled delivery'}
        </button>
      </Card>

      <Card>
        <h2 className="text-display text-lg font-semibold">
          Force generate for all eligible
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Operations override that ignores the delivery window. Does not send
          delivery notification emails.
        </p>
        <button
          type="button"
          disabled={!featureEnabled || isPending || eligibleRecipientCount === 0}
          onClick={runForceAll}
          className={`${buttonSecondaryClassName} mt-4`}
        >
          {isPending ? 'Generating…' : 'Force generate all'}
        </button>
      </Card>

      <Card>
        <h2 className="text-display text-lg font-semibold">
          Generate for one member
        </h2>
        <label className="mt-3 block text-sm">
          <span className="mb-1 block font-medium text-foreground">
            Member ID
          </span>
          <input
            type="text"
            value={memberId}
            onChange={(event) => setMemberId(event.target.value)}
            placeholder="Profile UUID"
            className={inputClassName}
          />
        </label>
        <button
          type="button"
          disabled={!featureEnabled || isPending || !memberId.trim()}
          onClick={runSingle}
          className={`${buttonSecondaryClassName} mt-4`}
        >
          {isPending ? 'Generating…' : 'Generate for member'}
        </button>
      </Card>

      {message ? <p className="text-sm text-foreground">{message}</p> : null}

      {summary ? (
        <Card padding="sm">
          <h3 className="text-sm font-semibold text-foreground">Last run</h3>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {'dueCount' in summary ? (
              <li>Due members: {summary.dueCount}</li>
            ) : null}
            <li>Processed: {summary.processed}</li>
            <li>Delivered batches: {summary.delivered}</li>
            <li>Empty batches: {summary.empty}</li>
            <li>Skipped members: {summary.skipped}</li>
            <li>Recommendations created: {summary.recommendationsCreated}</li>
            {'notificationsSent' in summary ? (
              <li>Notification emails sent: {summary.notificationsSent}</li>
            ) : null}
          </ul>
        </Card>
      ) : null}
    </div>
  )
}
