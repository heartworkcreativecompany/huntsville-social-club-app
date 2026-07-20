import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import AdminModerationActionsLog from '@/components/admin/admin-moderation-actions-log'
import EmptyState from '@/components/ui/empty-state'
import PageHeader from '@/components/ui/page-header'
import { loadModerationActions } from '@/lib/load-moderation-actions'
import type { ModerationActionType } from '@/lib/moderation-actions'
import { MODERATION_ACTION_TYPES } from '@/lib/moderation-action-labels'
import { createClient } from '@/lib/supabase/server'
import { requireAdminClient } from '@/lib/supabase/require-admin-client'
import { getViewer } from '@/lib/viewer'

type SearchParams = Promise<{
  action?: string
  target?: string
  source?: string
  days?: string
}>

function parseActionType(value: string | undefined): ModerationActionType | undefined {
  if (!value) return undefined
  return MODERATION_ACTION_TYPES.includes(value as ModerationActionType)
    ? (value as ModerationActionType)
    : undefined
}

function parseDays(value: string | undefined): number | undefined {
  if (!value || value === 'all') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30
}

export default async function AdminModerationActionsPage({
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
  const actionType = parseActionType(params.action)
  const targetMemberId = params.target?.trim() || undefined
  const sourceType = params.source?.trim() || undefined
  const daysParam = params.days ?? '30'
  const days = parseDays(daysParam)

  const supabase = requireAdminClient()
  const { items, error } = await loadModerationActions(supabase, {
    actionType,
    targetMemberId,
    sourceType,
    days,
    limit: 100,
  })

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Moderation audit"
        description="Enforcement history across message reports — suspensions, blocks, and review outcomes."
      />

      <div className="mb-6 flex flex-wrap gap-3 text-sm">
        <Link
          href="/admin/message-reports"
          className="font-medium text-accent underline"
        >
          Message reports
        </Link>
        <Link
          href="/admin/applications"
          className="text-muted-foreground underline"
        >
          Application queue
        </Link>
        <Link
          href="/admin/curated-intros"
          className="text-muted-foreground underline"
        >
          Curated intros
        </Link>
        <Link
          href="/admin/profile-revisions"
          className="text-muted-foreground underline"
        >
          Profile revisions
        </Link>
        <Link
          href="/admin/curated-matches"
          className="text-muted-foreground underline"
        >
          Match generation
        </Link>
        <Link href="/admin/users" className="text-muted-foreground underline">
          Manage roles
        </Link>
      </div>

      {error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : items.length === 0 &&
        !actionType &&
        !targetMemberId &&
        !sourceType &&
        daysParam === '30' ? (
        <EmptyState
          title="No moderation actions yet"
          description="When staff review reports, suspend messaging, or create admin blocks, those actions will appear here."
        />
      ) : (
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
          <AdminModerationActionsLog
            items={items}
            filters={{
              actionType: params.action ?? '',
              targetMemberId: params.target ?? '',
              sourceType: params.source ?? '',
              days: daysParam,
            }}
          />
        </Suspense>
      )}
    </>
  )
}
