import Link from 'next/link'
import { redirect } from 'next/navigation'
import AdminMemberVouchQueue from '@/components/admin/admin-member-vouch-queue'
import Badge from '@/components/ui/badge'
import PageHeader from '@/components/ui/page-header'
import {
  loadVouchModerationQueue,
  parseVouchQueueFilter,
  type VouchQueueFilter,
} from '@/lib/load-vouch-moderation-queue'
import { requireAdminClient } from '@/lib/supabase/require-admin-client'
import { getViewer } from '@/lib/viewer'

const FILTERS: { value: VouchQueueFilter; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
]

export default async function AdminMemberVouchesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const viewer = await getViewer()

  if (!viewer) {
    redirect('/login')
  }

  if (viewer.role !== 'admin') {
    redirect('/home')
  }

  const params = await searchParams
  const filter = parseVouchQueueFilter(params.status)
  const supabase = requireAdminClient()
  const { items, error } = await loadVouchModerationQueue(supabase, filter)
  const pendingCount = items.filter((item) => item.status === 'pending').length

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Member vouches"
        description="Review written member endorsements before they appear on public profiles."
        actions={
          filter === 'pending' && pendingCount > 0 ? (
            <Badge variant="warning">{pendingCount} pending</Badge>
          ) : (
            <Badge variant="muted">{filter}</Badge>
          )
        }
      />

      <div className="mb-6 flex flex-wrap gap-3 text-sm">
        {FILTERS.map((option) => (
          <Link
            key={option.value}
            href={
              option.value === 'pending'
                ? '/admin/member-vouches'
                : `/admin/member-vouches?status=${option.value}`
            }
            className={
              filter === option.value
                ? 'font-medium text-accent underline'
                : 'text-muted-foreground underline'
            }
          >
            {option.label}
          </Link>
        ))}
        <Link
          href="/admin/applications"
          className="text-muted-foreground underline"
        >
          Application queue
        </Link>
      </div>

      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      <AdminMemberVouchQueue items={items} />
    </>
  )
}
