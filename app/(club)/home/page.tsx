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

  const { role, applicationStatus, canAccessApp, profile } = viewer
  const isAdmin = role === 'admin'
  const isHost = role === 'host' || isAdmin
  const next = nextActionForApplicant(applicationStatus)

  return (
    <>
      <PageHeader
        eyebrow="Member home"
        title={
          profile?.full_name?.trim()
            ? `Welcome back, ${profile.full_name.split(' ')[0]}`
            : 'Welcome'
        }
        description="Your home for upcoming nights out, member discovery, and everything happening in the club."
        actions={<ApplicationStatusBadge status={applicationStatus} />}
      />

      {!canAccessApp ? (
        <Card className="mb-8 border-warning/30 bg-warning-soft/40">
          <h2 className="text-display text-lg font-semibold">{next.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {next.description}
          </p>
          <Link href="/application" className={`${buttonPrimaryClassName} mt-4`}>
            {next.cta}
          </Link>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {canAccessApp ? (
          <Card>
            <h2 className="text-display text-lg font-semibold">Events</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              See what&apos;s on — mixers, speed dating, and curated socials worth
              showing up for.
            </p>
            <Link href="/events" className={`${buttonPrimaryClassName} mt-4`}>
              View calendar
            </Link>
          </Card>
        ) : (
          <Card>
            <h2 className="text-display text-lg font-semibold">
              Events
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Unlocks after membership approval.
            </p>
            <div className="mt-4">
              <Badge variant="muted">Gated</Badge>
            </div>
          </Card>
        )}

        <Card>
          <h2 className="text-display text-lg font-semibold">
            {canAccessApp ? 'Your profile' : 'Application'}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {canAccessApp
              ? 'Keep your presence current for hosts and club operations.'
              : 'Track status and complete your membership application.'}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Role: {roleLabel(role)}
          </p>
          <Link
            href={canAccessApp ? '/members' : '/application'}
            className={`${buttonSecondaryClassName} mt-4`}
          >
            {canAccessApp ? 'View profile' : 'Open application'}
          </Link>
        </Card>

        {isHost && canAccessApp ? (
          <Card>
            <h2 className="text-display text-lg font-semibold">
              Host tools
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Create and manage events you host. Attendee names and exports live on
              each event page.
            </p>
            <Link href="/events" className={`${buttonSecondaryClassName} mt-4`}>
              Manage events
            </Link>
          </Card>
        ) : null}

        {isAdmin ? (
          <Card className="sm:col-span-2 lg:col-span-1">
            <h2 className="text-display text-lg font-semibold">
              Admin shortcuts
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Review applications, assign roles, and oversee programming.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/admin/applications" className={buttonPrimaryClassName}>
                Application queue
              </Link>
              <Link href="/admin/users" className={buttonSecondaryClassName}>
                Manage users
              </Link>
            </div>
          </Card>
        ) : null}
      </div>
    </>
  )
}
