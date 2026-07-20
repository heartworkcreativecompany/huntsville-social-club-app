import Link from 'next/link'
import { redirect } from 'next/navigation'
import AdminRecontactQueue from '@/components/admin/admin-recontact-queue'
import Badge from '@/components/ui/badge'
import EmptyState from '@/components/ui/empty-state'
import PageHeader from '@/components/ui/page-header'
import { loadRecontactReviewQueue } from '@/lib/load-recontact-queue'
import { createClient } from '@/lib/supabase/server'
import { requireAdminClient } from '@/lib/supabase/require-admin-client'
import { getViewer } from '@/lib/viewer'

export default async function AdminRecontactRequestsPage() {
  const viewer = await getViewer()

  if (!viewer) {
    redirect('/login')
  }

  if (viewer.role !== 'admin') {
    redirect('/home')
  }

  const supabase = requireAdminClient()
  const { items, error } = await loadRecontactReviewQueue(supabase)

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Recontact reviews"
        description="Review sender requests for a second message attempt after a decline. Staff asks the recipient — never approves messaging unilaterally."
        actions={
          items.length > 0 ? (
            <Badge variant="warning">{items.length} pending</Badge>
          ) : (
            <Badge variant="success">Queue clear</Badge>
          )
        }
      />

      <div className="mb-6 flex flex-wrap gap-3 text-sm">
        <Link
          href="/admin/message-reports"
          className="font-medium text-accent underline"
        >
          Message reports
        </Link>
        <Link
          href="/admin/curated-intros"
          className="text-muted-foreground underline"
        >
          Intro audit
        </Link>
        <Link href="/admin/users" className="text-muted-foreground underline">
          Manage roles
        </Link>
      </div>

      {error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : items.length === 0 ? (
        <EmptyState
          title="No recontact reviews"
          description="When a sender requests another chance after a declined message, it will appear here."
        />
      ) : (
        <AdminRecontactQueue items={items} />
      )}
    </>
  )
}
