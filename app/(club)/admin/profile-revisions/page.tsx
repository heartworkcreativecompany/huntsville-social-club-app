import Link from 'next/link'
import { redirect } from 'next/navigation'
import AdminProfileRevisionQueue from '@/components/admin/admin-profile-revision-queue'
import Badge from '@/components/ui/badge'
import EmptyState from '@/components/ui/empty-state'
import PageHeader from '@/components/ui/page-header'
import { createClient } from '@/lib/supabase/server'
import { requireAdminClient } from '@/lib/supabase/require-admin-client'
import {
  buildProfileRevisionDiff,
  liveProfileRevisionSnapshot,
  parseProfilePendingRevision,
} from '@/lib/profile-revision'
import { getViewer } from '@/lib/viewer'

export default async function AdminProfileRevisionsPage() {
  const viewer = await getViewer()

  if (!viewer) {
    redirect('/login')
  }

  if (viewer.role !== 'admin') {
    redirect('/home')
  }

  const supabase = requireAdminClient()

  const { data: rows, error } = await supabase
    .from('profiles')
    .select(
      'id, email, full_name, application_draft, connections_open_to, discovery_interests, membership_intent, location_area, profile_pending_revision, profile_revision_submitted_at'
    )
    .eq('profile_revision_status', 'pending')
    .order('profile_revision_submitted_at', {
      ascending: true,
      nullsFirst: false,
    })

  const items = (rows ?? [])
    .map((row) => {
      const pending = parseProfilePendingRevision(row.profile_pending_revision)
      if (!pending) return null

      const live = liveProfileRevisionSnapshot({
        full_name: row.full_name,
        membership_intent: row.membership_intent,
        location_area: row.location_area,
        application_draft: row.application_draft,
        connections_open_to: row.connections_open_to,
        discovery_interests: row.discovery_interests,
      })

      return {
        id: row.id,
        email: row.email,
        full_name: row.full_name,
        submittedAt: row.profile_revision_submitted_at,
        diff: buildProfileRevisionDiff(live, pending),
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Profile revisions"
        description="Review post-approval profile edits before they go live in the member directory."
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
        <p className="text-sm text-danger">{error.message}</p>
      ) : items.length === 0 ? (
        <EmptyState
          title="No pending profile revisions"
          description="Approved members' profile edits will appear here for review."
        />
      ) : (
        <AdminProfileRevisionQueue items={items} />
      )}
    </>
  )
}
