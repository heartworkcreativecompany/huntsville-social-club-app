import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireAdminClient } from '@/lib/supabase/require-admin-client'
import AdminApplicationQueue from '@/components/admin/admin-application-queue'
import Badge from '@/components/ui/badge'
import EmptyState from '@/components/ui/empty-state'
import PageHeader from '@/components/ui/page-header'
import { queueSortRank, type ApplicationStatus } from '@/lib/application'
import { mergeProfileIntoDraft } from '@/lib/application-draft-sync'
import { getViewer } from '@/lib/viewer'

type ApplicantRow = {
  id: string
  email: string | null
  full_name: string | null
  application_status: string | null
  membership_intent: string | null
  application_submitted_at: string | null
  created_at: string | null
  application_draft: unknown
}

export default async function AdminApplicationsPage() {
  const viewer = await getViewer()

  if (!viewer) {
    redirect('/login')
  }

  if (viewer.role !== 'admin') {
    redirect('/home')
  }

  const supabase = requireAdminClient()

  const { data: applicants, error } = await supabase
    .from('profiles')
    .select(
      'id, email, full_name, application_status, membership_intent, application_submitted_at, created_at, application_draft'
    )
    .neq('application_status', 'approved')
    .order('application_submitted_at', { ascending: true, nullsFirst: false })

  const sorted = [...(applicants ?? [])].sort((a, b) => {
    const rankA = queueSortRank(
      (a.application_status ?? 'draft') as ApplicationStatus
    )
    const rankB = queueSortRank(
      (b.application_status ?? 'draft') as ApplicationStatus
    )
    if (rankA !== rankB) return rankA - rankB
    const submittedA = a.application_submitted_at
      ? new Date(a.application_submitted_at).getTime()
      : 0
    const submittedB = b.application_submitted_at
      ? new Date(b.application_submitted_at).getTime()
      : 0
    return submittedB - submittedA
  })

  const queueCount = sorted.filter((row) =>
    ['submitted', 'in_review', 'needs_info'].includes(
      row.application_status ?? ''
    )
  ).length

  const queueApplicants = sorted.map((applicant: ApplicantRow) => {
    const status = (applicant.application_status ?? 'draft') as ApplicationStatus
    const draft = mergeProfileIntoDraft({
      full_name: applicant.full_name,
      membership_intent: applicant.membership_intent,
      location_area: null,
      application_draft: applicant.application_draft,
    })

    return {
      id: applicant.id,
      email: applicant.email,
      full_name: applicant.full_name,
      application_status: status,
      membership_intent: applicant.membership_intent,
      application_submitted_at: applicant.application_submitted_at,
      displayName: draft.profile.displayName,
      photoCount: draft.photos.length,
      photos: draft.photos,
    }
  })

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Application queue"
        description="Review membership applications, approve trusted members, or request more information."
        actions={
          queueCount > 0 ? (
            <Badge variant="warning">{queueCount} awaiting decision</Badge>
          ) : (
            <Badge variant="success">Queue clear</Badge>
          )
        }
      />

      <div className="mb-6 flex flex-wrap gap-3 text-sm">
        <Link href="/admin/users" className="font-medium text-accent underline">
          Manage roles
        </Link>
        <Link
          href="/admin/profile-revisions"
          className="text-muted-foreground underline"
        >
          Profile revisions
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
        <Link href="/members" className="text-muted-foreground underline">
          Member directory
        </Link>
      </div>

      {error ? (
        <p className="text-sm text-danger">{error.message}</p>
      ) : sorted.length === 0 ? (
        <EmptyState
          title="No pending applications"
          description="New submissions will appear here for review."
        />
      ) : (
        <AdminApplicationQueue applicants={queueApplicants} />
      )}
    </>
  )
}
