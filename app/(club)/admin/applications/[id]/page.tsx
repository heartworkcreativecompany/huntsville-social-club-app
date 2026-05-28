import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ApplicationStatusBadge from '@/components/application/application-status-badge'
import Card from '@/components/ui/card'
import EmptyState from '@/components/ui/empty-state'
import {
  applicationStatusLabel,
  parseApplicationDraft,
  type ApplicationStatus,
} from '@/lib/application'
import { getViewer } from '@/lib/viewer'
import ApplicationReviewActions from '../application-review-actions'

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function AdminApplicationDetailPage({ params }: PageProps) {
  const { id } = await params
  const viewer = await getViewer()

  if (!viewer) {
    redirect('/login')
  }

  if (viewer.role !== 'admin') {
    redirect('/home')
  }

  const supabase = await createClient()

  const { data: applicant, error } = await supabase
    .from('profiles')
    .select(
      'id, email, full_name, role, application_status, membership_intent, location_area, referral_source, application_draft, application_submitted_at, application_reviewed_at, verified_at, admin_review_notes, created_at'
    )
    .eq('id', id)
    .single()

  if (error || !applicant) {
    return (
      <EmptyState
        title="Application not found"
        description={error?.message ?? 'This profile could not be loaded.'}
        action={
          <Link
            href="/admin/applications"
            className="text-sm font-medium text-accent underline"
          >
            Back to queue
          </Link>
        }
      />
    )
  }

  const status = (applicant.application_status ?? 'draft') as ApplicationStatus
  const draft = parseApplicationDraft(applicant.application_draft)

  return (
    <>
      <Link
        href="/admin/applications"
        className="mb-6 inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to queue
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-display text-3xl font-medium text-foreground">
            {applicant.full_name ?? applicant.email ?? 'Applicant'}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {applicant.email ?? 'No email on file'}
          </p>
        </div>
        <ApplicationStatusBadge status={status} />
      </div>

      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="text-display text-lg font-medium text-foreground">
            Application
          </h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd className="font-medium text-foreground">
                {applicationStatusLabel(status)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Intent</dt>
              <dd className="leading-relaxed text-foreground">
                {(applicant.membership_intent ?? draft.membershipIntent) || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Area</dt>
              <dd className="font-medium text-foreground">
                {applicant.location_area ?? draft.locationArea ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Referral</dt>
              <dd className="font-medium text-foreground">
                {applicant.referral_source ?? draft.referralSource ?? '—'}
              </dd>
            </div>
            {applicant.application_submitted_at ? (
              <div>
                <dt className="text-muted-foreground">Submitted</dt>
                <dd className="font-medium text-foreground">
                  {new Date(applicant.application_submitted_at).toLocaleString()}
                </dd>
              </div>
            ) : null}
          </dl>
        </Card>

        <Card>
          <h2 className="text-display text-lg font-medium text-foreground">
            Review actions
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Approve to grant verified membership and discovery visibility.
          </p>
          <div className="mt-4">
            <ApplicationReviewActions applicantId={applicant.id} />
          </div>
          {applicant.admin_review_notes ? (
            <p className="mt-4 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Previous notes: </span>
              {applicant.admin_review_notes}
            </p>
          ) : null}
        </Card>
      </div>
    </>
  )
}
