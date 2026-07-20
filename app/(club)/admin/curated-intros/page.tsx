import Link from 'next/link'
import { redirect } from 'next/navigation'
import AdminCuratedIntroQueue from '@/components/admin/admin-curated-intro-queue'
import Badge from '@/components/ui/badge'
import EmptyState from '@/components/ui/empty-state'
import PageHeader from '@/components/ui/page-header'
import { loadCuratedIntroQueue } from '@/lib/load-curated-intro-queue'
import { createClient } from '@/lib/supabase/server'
import { requireAdminClient } from '@/lib/supabase/require-admin-client'
import { getViewer } from '@/lib/viewer'

export default async function AdminCuratedIntrosPage() {
  const viewer = await getViewer()

  if (!viewer) {
    redirect('/login')
  }

  if (viewer.role !== 'admin') {
    redirect('/home')
  }

  const supabase = requireAdminClient()
  const { items, error } = await loadCuratedIntroQueue(supabase)
  const sortedItems = [...items].sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1
    if (b.status === 'pending' && a.status !== 'pending') return 1
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })
  const pendingCount = items.filter((item) => item.status === 'pending').length

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Curated intro requests"
        description="Review intro requests from curated match recommendations, open conversations, or decline when a connection is not appropriate."
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
          href="/admin/profile-revisions"
          className="text-muted-foreground underline"
        >
          Profile revisions
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
      ) : items.length === 0 ? (
        <EmptyState
          title="No curated intro requests"
          description="When members request intros from their curated matches inbox, those requests will appear here for staff review."
        />
      ) : (
        <AdminCuratedIntroQueue items={sortedItems} />
      )}
    </>
  )
}
