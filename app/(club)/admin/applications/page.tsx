import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ApplicationStatusBadge from '@/components/application/application-status-badge'
import Card from '@/components/ui/card'
import EmptyState from '@/components/ui/empty-state'
import PageHeader from '@/components/ui/page-header'
import Badge from '@/components/ui/badge'
import {
  applicationStatusLabel,
  queueSortRank,
  type ApplicationStatus,
} from '@/lib/application'
import { mergeProfileIntoDraft } from '@/lib/application-draft-sync'
import { AdminApplicationPhotoThumbnail } from '@/components/admin/admin-application-photo-gallery'
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

  const supabase = await createClient()

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
        <ul className="grid gap-4">
          {sorted.map((applicant) => {
            const status = (applicant.application_status ??
              'draft') as ApplicationStatus

            const draft = mergeProfileIntoDraft({
              full_name: applicant.full_name,
              membership_intent: applicant.membership_intent,
              location_area: null,
              application_draft: applicant.application_draft,
            })

            return (
              <li key={applicant.id}>
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 gap-4">
                      <AdminApplicationPhotoThumbnail
                        applicantId={applicant.id}
                        photos={draft.photos}
                      />
                      <div className="min-w-0">
                        <Link
                          href={`/admin/applications/${applicant.id}`}
                          className="text-display text-lg font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-accent"
                        >
                          {applicant.full_name ?? applicant.email ?? 'Applicant'}
                        </Link>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {applicant.email ?? 'No email'}
                        </p>
                      </div>
                    </div>
                    <ApplicationStatusBadge status={status} />
                  </div>
                  {applicant.membership_intent ? (
                    <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
                      {applicant.membership_intent}
                    </p>
                  ) : null}
                  <p className="mt-3 text-xs text-muted-foreground">
                    {applicationStatusLabel(status)}
                    {applicant.application_submitted_at
                      ? ` · Submitted ${new Date(applicant.application_submitted_at).toLocaleString()}`
                      : ' · Not yet submitted'}
                  </p>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
