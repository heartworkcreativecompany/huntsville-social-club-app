import Link from 'next/link'
import { redirect } from 'next/navigation'
import AdminMessageReportsQueue from '@/components/admin/admin-message-reports-queue'
import Badge from '@/components/ui/badge'
import EmptyState from '@/components/ui/empty-state'
import PageHeader from '@/components/ui/page-header'
import {
  loadMessageReportQueue,
  parseFocusReportId,
} from '@/lib/load-message-reports-queue'
import { createClient } from '@/lib/supabase/server'
import { requireAdminClient } from '@/lib/supabase/require-admin-client'
import { getViewer } from '@/lib/viewer'

type SearchParams = Promise<{
  report?: string
}>

export default async function AdminMessageReportsPage({
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
  const requestedReportId = params.report?.trim() || null
  const focusReportId = parseFocusReportId(params.report)
  const focusLinkInvalid = Boolean(requestedReportId && !focusReportId)

  const supabase = requireAdminClient()
  const { items, error, focusStatus } = await loadMessageReportQueue(supabase, {
    focusReportId,
  })
  const pendingCount = items.filter((item) => item.status === 'pending').length

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Message reports"
        description="Review member-reported conversations, inspect recent thread context, and close out moderation cases."
        actions={
          pendingCount > 0 ? (
            <Badge variant="warning">{pendingCount} pending</Badge>
          ) : (
            <Badge variant="success">Queue clear</Badge>
          )
        }
      />

      <div className="mb-6 flex flex-wrap gap-3 text-sm">
        <Link
          href="/admin/applications"
          className="font-medium text-accent underline"
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
          href="/admin/moderation-actions"
          className="text-muted-foreground underline"
        >
          Moderation audit
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
      ) : focusLinkInvalid ? (
        <div className="mb-6 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-foreground">
          <p className="font-medium">Invalid report link</p>
          <p className="mt-1 text-muted-foreground">
            The report ID in this URL is not valid. Open a report from the{' '}
            <Link href="/admin/moderation-actions" className="text-accent underline">
              moderation audit
            </Link>{' '}
            or browse the queue below.
          </p>
        </div>
      ) : focusStatus === 'missing' ? (
        <div className="mb-6 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-foreground">
          <p className="font-medium">Report not found</p>
          <p className="mt-1 text-muted-foreground">
            No message report matches this link. It may have been removed or you
            may not have access to it.
          </p>
          <Link
            href="/admin/message-reports"
            className="mt-2 inline-flex text-accent underline"
          >
            View all reports
          </Link>
        </div>
      ) : null}

      {error ? null : items.length === 0 ? (
        <EmptyState
          title="No message reports"
          description="When members report a conversation from their inbox, those reports will appear here for staff review."
        />
      ) : (
        <AdminMessageReportsQueue
          items={items}
          focusReportId={focusStatus === 'found' ? focusReportId : null}
        />
      )}
    </>
  )
}
