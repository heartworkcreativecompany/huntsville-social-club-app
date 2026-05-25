import Link from 'next/link'
import Badge from '@/components/ui/badge'
import Card from '@/components/ui/card'
import PageHeader from '@/components/ui/page-header'
import { buttonPrimaryClassName, buttonSecondaryClassName, roleLabel } from '@/lib/event-labels'
import { membershipStatusLabel } from '@/lib/membership'
import { getViewer } from '@/lib/viewer'

export default async function HomePage() {
  const viewer = await getViewer()

  if (!viewer) {
    return null
  }

  const { role, membershipStatus, canAccessApp, profile } = viewer
  const isAdmin = role === 'admin'
  const isHost = role === 'host' || isAdmin
  const isPending =
    membershipStatus === 'applicant' || membershipStatus === 'pending'

  return (
    <>
      <PageHeader
        eyebrow="Member home"
        title={
          profile?.full_name?.trim()
            ? `Welcome back, ${profile.full_name.split(' ')[0]}`
            : 'Welcome'
        }
        description="Your club hub for gatherings, profile, and trusted community access."
        actions={
          <Badge variant={membershipStatus === 'approved' ? 'success' : 'warning'}>
            {membershipStatusLabel(membershipStatus)}
          </Badge>
        }
      />

      {isPending ? (
        <Card className="mb-8 border-warning/30 bg-warning-soft/40">
          <h2 className="text-display text-lg font-medium text-foreground">
            Application in progress
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Your membership is being reviewed. Complete your profile with a full
            name so the team can verify you. You will receive full calendar access
            once approved.
          </p>
          <Link href="/members" className={`${buttonSecondaryClassName} mt-4`}>
            Complete profile
          </Link>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <h2 className="text-display text-lg font-medium text-foreground">
            Events
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Browse upcoming gatherings, RSVP, and view details for hosts you trust.
          </p>
          {canAccessApp ? (
            <Link href="/events" className={`${buttonPrimaryClassName} mt-4`}>
              View calendar
            </Link>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              Available after membership approval.
            </p>
          )}
        </Card>

        <Card>
          <h2 className="text-display text-lg font-medium text-foreground">
            Your profile
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Keep your name and contact details current for hosts and club operations.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Role: {roleLabel(role)}
          </p>
          <Link href="/members" className={`${buttonSecondaryClassName} mt-4`}>
            Edit profile
          </Link>
        </Card>

        {isHost ? (
          <Card>
            <h2 className="text-display text-lg font-medium text-foreground">
              Host tools
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Create and manage events you host. Attendee names and exports live on
              each event page.
            </p>
            {canAccessApp ? (
              <Link href="/events" className={`${buttonSecondaryClassName} mt-4`}>
                Manage events
              </Link>
            ) : null}
          </Card>
        ) : null}

        {isAdmin ? (
          <Card className="sm:col-span-2 lg:col-span-1">
            <h2 className="text-display text-lg font-medium text-foreground">
              Admin shortcuts
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Review members, assign roles, and oversee club programming.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/admin/users" className={buttonPrimaryClassName}>
                Manage users
              </Link>
              <Link href="/events" className={buttonSecondaryClassName}>
                All events
              </Link>
            </div>
          </Card>
        ) : null}
      </div>
    </>
  )
}
