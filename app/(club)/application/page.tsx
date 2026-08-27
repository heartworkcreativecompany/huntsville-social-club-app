import Link from 'next/link'
import { redirect } from 'next/navigation'
import Card from '@/components/ui/card'
import PageHeader from '@/components/ui/page-header'
import {
  canEditApplication,
  nextActionForApplicant,
  showApplicationReviewActionCard,
  showApplicationStatusTracking,
} from '@/lib/application'
import {
  APPLICATION_PAGE_INTRO,
  APPLICATION_PAGE_SUBMITTED_INTRO,
} from '@/lib/application-form-content'
import { mergeProfileIntoDraft } from '@/lib/application-draft-sync'
import { getViewer } from '@/lib/viewer'
import { buttonSecondaryClassName } from '@/lib/event-labels'
import ApplicationProfilePreview from '@/components/application/application-profile-preview'
import ApplicationForm from './application-form'

export default async function ApplicationPage() {
  const viewer = await getViewer()

  if (!viewer) {
    redirect('/login')
  }

  const profile = viewer.profile
  const status = viewer.applicationStatus
  const next = nextActionForApplicant(status)
  const draft = mergeProfileIntoDraft(profile)
  const showReadOnlyPreview =
    !canEditApplication(status) && status !== 'approved'
  const adminNotes = profile?.admin_review_notes?.trim() || null

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
        description={
          showReadOnlyPreview
            ? APPLICATION_PAGE_SUBMITTED_INTRO
            : APPLICATION_PAGE_INTRO
        }
        actions={
          showApplicationStatusTracking(status) ? (
            <Link
              href="/application/status"
              className="inline-flex min-h-11 items-center text-sm font-medium text-accent underline"
            >
              Track status
            </Link>
          ) : null
        }
      />

      {showReadOnlyPreview ? (
        <div className="mb-10 grid gap-6">
          <Card className="border-success/30 bg-success-soft/40">
            <h2 className="text-display text-lg font-semibold">
              Application submitted
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              The membership team has your application. Track verification and
              review progress on your status page.
            </p>
            <Link
              href="/application/status"
              className={`${buttonSecondaryClassName} mt-4 w-full sm:w-auto`}
            >
              View status & verification
            </Link>
          </Card>

          {adminNotes ? (
            <Card className="border-warning/30 bg-warning-soft/40" padding="sm">
              <h2 className="text-display text-base font-medium text-foreground">
                Reviewer notes
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {adminNotes}
              </p>
            </Card>
          ) : null}

          <section>
            <h2 className="text-display mb-4 text-xl font-medium text-foreground">
              Your profile preview
            </h2>
            <ApplicationProfilePreview
              draft={draft}
              userId={viewer.userId}
              email={viewer.email}
              applicationStatus={status}
              variant="submitted"
            />
          </section>
        </div>
      ) : showApplicationReviewActionCard(status) ? (
        <div className="mb-8">
          <Card>
            <h2 className="text-display text-lg font-semibold">{next.title}</h2>
            <p className="mt-2 text-sm leading-relaxed break-words text-muted-foreground">
              {next.description}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a href={next.href} className={`${buttonSecondaryClassName} w-full sm:w-auto`}>
                {next.cta}
              </a>
              <Link
                href="/application/status"
                className="inline-flex min-h-11 items-center text-sm font-medium text-accent underline"
              >
                View full status
              </Link>
            </div>
          </Card>
        </div>
      ) : null}

      {canEditApplication(status) ? (
        <section>
          <h2 className="text-display mb-4 text-xl font-medium break-words text-foreground">
            Application form
          </h2>
          <ApplicationForm
            initialDraft={draft}
            applicationStatus={status}
            adminNotes={profile?.admin_review_notes ?? null}
            userId={viewer.userId}
            email={viewer.email}
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
