'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useTransition } from 'react'
import Badge from '@/components/ui/badge'
import {
  MODERATION_ACTION_TYPES,
  MODERATION_SOURCE_TYPES,
  moderationActionLabel,
  moderationSourceHref,
  moderationSourceLabel,
} from '@/lib/moderation-action-labels'
import { inputClassName } from '@/lib/event-labels'
import type { ModerationActionLogItem } from '@/lib/load-moderation-actions'

function actionBadgeVariant(
  actionType: string
): 'accent' | 'success' | 'muted' | 'warning' | 'danger' {
  switch (actionType) {
    case 'messaging_suspended':
      return 'warning'
    case 'messaging_unsuspended':
      return 'success'
    case 'message_report_dismissed':
      return 'muted'
    case 'admin_member_block':
      return 'danger'
    default:
      return 'accent'
  }
}

export default function AdminModerationActionsLog({
  items,
  filters,
}: {
  items: ModerationActionLogItem[]
  filters: {
    actionType: string
    targetMemberId: string
    sourceType: string
    days: string
  }
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const applyFilters = (formData: FormData) => {
    const params = new URLSearchParams()
    const action = String(formData.get('actionType') ?? '').trim()
    const target = String(formData.get('targetMemberId') ?? '').trim()
    const source = String(formData.get('sourceType') ?? '').trim()
    const days = String(formData.get('days') ?? '').trim()

    if (action) params.set('action', action)
    if (target) params.set('target', target)
    if (source) params.set('source', source)
    if (days && days !== '30') params.set('days', days)

    startTransition(() => {
      const query = params.toString()
      router.push(
        query ? `/admin/moderation-actions?${query}` : '/admin/moderation-actions'
      )
    })
  }

  const clearFilters = () => {
    startTransition(() => {
      router.push('/admin/moderation-actions')
    })
  }

  const filterByTarget = (memberId: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('target', memberId)
    startTransition(() => {
      router.push(`/admin/moderation-actions?${params.toString()}`)
    })
  }

  return (
    <div className="space-y-6">
      <form
        action={applyFilters}
        className="rounded-xl border border-border bg-card p-4 shadow-sm"
      >
        <p className="text-sm font-medium text-foreground">Filter audit log</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Action type
            </span>
            <select
              name="actionType"
              defaultValue={filters.actionType}
              className={inputClassName}
            >
              <option value="">All actions</option>
              {MODERATION_ACTION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {moderationActionLabel(type)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Target member ID
            </span>
            <input
              name="targetMemberId"
              type="text"
              defaultValue={filters.targetMemberId}
              placeholder="UUID"
              className={inputClassName}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Source area
            </span>
            <select
              name="sourceType"
              defaultValue={filters.sourceType}
              className={inputClassName}
            >
              <option value="">All sources</option>
              {MODERATION_SOURCE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {moderationSourceLabel(type)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Time range
            </span>
            <select
              name="days"
              defaultValue={filters.days}
              className={inputClassName}
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="all">All time</option>
            </select>
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
          No moderation actions match the current filters.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const sourceHref = moderationSourceHref(
              item.sourceType,
              item.sourceId
            )

            return (
              <li
                key={item.id}
                className="rounded-xl border border-border bg-card p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Badge variant={actionBadgeVariant(item.actionType)}>
                      {moderationActionLabel(item.actionType)}
                    </Badge>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {new Date(item.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {sourceHref ? (
                    <Link
                      href={sourceHref}
                      className="text-sm font-medium text-accent underline"
                    >
                      View source
                    </Link>
                  ) : null}
                </div>

                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Actor
                    </dt>
                    <dd className="mt-1">
                      {item.actor ? (
                        <Link
                          href={`/members/${item.actor.id}`}
                          className="font-medium text-accent underline"
                        >
                          {item.actor.name}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Target member
                    </dt>
                    <dd className="mt-1">
                      {item.targetMember ? (
                        <span className="inline-flex flex-wrap items-center gap-2">
                          <Link
                            href={`/members/${item.targetMember.id}`}
                            className="font-medium text-accent underline"
                          >
                            {item.targetMember.name}
                          </Link>
                          <button
                            type="button"
                            onClick={() => filterByTarget(item.targetMember!.id)}
                            className="text-xs text-muted-foreground underline"
                          >
                            Filter log
                          </button>
                        </span>
                      ) : (
                        '—'
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Source
                    </dt>
                    <dd className="mt-1 text-muted-foreground">
                      {moderationSourceLabel(item.sourceType)}
                      {item.sourceId ? (
                        <span className="mt-1 block break-all font-mono text-xs">
                          {item.sourceId}
                        </span>
                      ) : null}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Reason
                    </dt>
                    <dd className="mt-1 text-foreground">
                      {item.reason?.trim() || '—'}
                    </dd>
                  </div>
                </dl>

                {item.details ? (
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    {item.details}
                  </p>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
