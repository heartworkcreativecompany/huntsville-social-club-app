import { redirect } from 'next/navigation'
import Link from 'next/link'
import ApplicationStatusBadge from '@/components/application/application-status-badge'
import Badge from '@/components/ui/badge'
import Card from '@/components/ui/card'
import PageHeader from '@/components/ui/page-header'
import { buttonPrimaryClassName, buttonSecondaryClassName, roleLabel } from '@/lib/event-labels'
import { nextActionForApplicant } from '@/lib/application'
import { getViewer } from '@/lib/viewer'

export default async function HomePage() {
  const viewer = await getViewer()

  if (!viewer) {
    return null
  }

  if (viewer.canAccessApp) {
    redirect('/dashboard')
  }

  const { role, applicationStatus, profile } = viewer
  const next = nextActionForApplicant(applicationStatus)

  return (
    <>
      <PageHeader
        eyebrow="Welcome"
        title={
          profile?.full_name?.trim()
            ? `Hi, ${profile.full_name.split(' ')[0]}`
            : 'Welcome'
        }
        description="Complete your application to unlock member discovery, events, and messages."
        actions={<ApplicationStatusBadge status={applicationStatus} />}
      />

      <Card className="mb-8 border-warning/30 bg-warning-soft/40">
        <h2 className="text-display text-lg font-semibold">{next.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {next.description}
        </p>
        <Link href="/application" className={`${buttonPrimaryClassName} mt-4`}>
          {next.cta}
        </Link>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="text-display text-lg font-semibold">Application</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Track status and complete your membership application.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Role: {roleLabel(role)}
          </p>
          <Link href="/application" className={`${buttonSecondaryClassName} mt-4`}>
            Open application
          </Link>
        </Card>

        <Card>
          <h2 className="text-display text-lg font-semibold">Events</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Unlocks after membership approval.
          </p>
          <div className="mt-4">
            <Badge variant="muted">Gated</Badge>
          </div>
        </Card>
      </div>
    </>
  )
}
