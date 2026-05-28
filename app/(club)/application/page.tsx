import Link from 'next/link'
import { redirect } from 'next/navigation'
import ApplicationStatusBadge from '@/components/application/application-status-badge'
import Card from '@/components/ui/card'
import PageHeader from '@/components/ui/page-header'
import {
  applicationStatusLabel,
  canEditApplication,
  emptyDraft,
  nextActionForApplicant,
  parseApplicationDraft,
} from '@/lib/application'
import type { ApplicationDraft } from '@/lib/application'
import { getViewer, type ViewerProfile } from '@/lib/viewer'
import { buttonSecondaryClassName } from '@/lib/event-labels'
import ApplicationForm from './application-form'

function buildInitialDraft(profile: ViewerProfile | null): ApplicationDraft {
  const parsed = profile?.application_draft
    ? parseApplicationDraft(profile.application_draft)
    : emptyDraft()

  return {
    ...parsed,
    fullName: parsed.fullName || profile?.full_name || '',
    membershipIntent:
      parsed.membershipIntent || profile?.membership_intent || '',
    locationArea: parsed.locationArea || profile?.location_area || '',
    referralSource: parsed.referralSource || profile?.referral_source || '',
  }
}

export default async function ApplicationPage() {
  const viewer = await getViewer()

  if (!viewer) {
    redirect('/login')
  }

  const profile = viewer.profile
  const status = viewer.applicationStatus
  const next = nextActionForApplicant(status)
  const draft = buildInitialDraft(profile)

  return (
    <>
      {!viewer.applicationSchemaReady ? (
        <Card className="mb-6 border-warning/30 bg-warning-soft/40" padding="sm">
          <p className="text-sm text-muted-foreground">
            Application workflow database columns are not applied yet. Run{' '}
            <code className="text-foreground">npx supabase db push</code> (see
            SUPABASE_SETUP.md) to enable full draft, review, and approval flows.
          </p>
        </Card>
      ) : null}

      <PageHeader
        eyebrow="Membership"
        title="Your application"
        description="A verified, trust-gated path into Huntsville Social Club. Save progress anytime and submit when ready."
        actions={<ApplicationStatusBadge status={status} />}
      />

      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="text-display text-lg font-medium text-foreground">
            {next.title}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {next.description}
          </p>
          {canEditApplication(status) ? (
            <a href={next.href} className={`${buttonSecondaryClassName} mt-4`}>
              {next.cta}
            </a>
          ) : (
            <Link href={next.href} className={`${buttonSecondaryClassName} mt-4`}>
              {next.cta}
            </Link>
          )}
        </Card>

        <Card>
          <h2 className="text-display text-lg font-medium text-foreground">
            Verification summary
          </h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd className="font-medium text-foreground">
                {applicationStatusLabel(status)}
              </dd>
            </div>
            {profile?.application_submitted_at ? (
              <div>
                <dt className="text-muted-foreground">Submitted</dt>
                <dd className="font-medium text-foreground">
                  {new Date(profile.application_submitted_at).toLocaleString()}
                </dd>
              </div>
            ) : null}
            {profile?.verified_at ? (
              <div>
                <dt className="text-muted-foreground">Verified</dt>
                <dd className="font-medium text-foreground">
                  {new Date(profile.verified_at).toLocaleString()}
                </dd>
              </div>
            ) : (
              <div>
                <dt className="text-muted-foreground">Verified</dt>
                <dd className="text-muted-foreground">Pending approval</dd>
              </div>
            )}
            {profile?.admin_review_notes &&
            (status === 'needs_info' || status === 'rejected') ? (
              <div>
                <dt className="text-muted-foreground">Reviewer notes</dt>
                <dd className="leading-relaxed text-foreground">
                  {profile.admin_review_notes}
                </dd>
              </div>
            ) : null}
          </dl>
        </Card>
      </div>

      {canEditApplication(status) ? (
        <section>
          <h2 className="text-display mb-4 text-xl font-medium text-foreground">
            Application form
          </h2>
          <ApplicationForm
            initialDraft={draft}
            applicationStatus={status}
            adminNotes={profile?.admin_review_notes ?? null}
          />
        </section>
      ) : viewer.canAccessApp ? (
        <Card padding="sm">
          <p className="text-sm text-muted-foreground">
            Your membership is active. Visit{' '}
            <Link href="/events" className="font-medium text-accent underline">
              events
            </Link>{' '}
            or{' '}
            <Link href="/members" className="font-medium text-accent underline">
              members
            </Link>{' '}
            to participate.
          </p>
        </Card>
      ) : null}
    </>
  )
}
