import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Badge from '@/components/ui/badge'
import Card from '@/components/ui/card'
import EmptyState from '@/components/ui/empty-state'
import PageHeader from '@/components/ui/page-header'
import ApplicationStatusBadge from '@/components/application/application-status-badge'
import { resolveApplicationStatus, type ApplicationStatus } from '@/lib/application'
import { getViewer } from '@/lib/viewer'
import RoleUpdate from './role-update'

export default async function AdminUsersPage() {
  const viewer = await getViewer()

  if (!viewer) {
    redirect('/login')
  }

  if (viewer.role !== 'admin') {
    return (
      <EmptyState
        title="Operations access required"
        description="This area is limited to club administrators."
        action={
          <Link href="/home" className="text-sm font-medium text-accent underline">
            Return home
          </Link>
        }
      />
    )
  }

  const supabase = await createClient()

  const { data: users, error } = await supabase
    .from('profiles')
    .select(
      'id, email, full_name, role, created_at, application_status, membership_intent, verified_at'
    )
    .order('email', { ascending: true })

  const pendingCount =
    users?.filter((p) => {
      const status = resolveApplicationStatus(p) as ApplicationStatus
      return status !== 'approved'
    }).length ?? 0

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="User management"
        description="Review applications, assign roles, and maintain a high-trust member roster."
        actions={
          pendingCount > 0 ? (
            <Badge variant="warning">{pendingCount} in queue</Badge>
          ) : (
            <Badge variant="success">Queue clear</Badge>
          )
        }
      />

      <Card className="mb-6" padding="sm">
        <p className="text-sm text-muted-foreground">
          Admins cannot change their own role here. Use the{' '}
          <Link href="/admin/applications" className="font-medium text-accent underline">
            application queue
          </Link>{' '}
          to approve, reject, or request more information.
        </p>
      </Card>

      {error ? (
        <p className="text-sm text-danger">Could not load users: {error.message}</p>
      ) : !users?.length ? (
        <EmptyState title="No users found" />
      ) : (
        <ul className="grid gap-4">
          {users.map((profile) => (
            <li key={profile.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-display text-lg font-semibold">
                      {profile.full_name ?? profile.email ?? 'Unknown member'}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {profile.email ?? 'No email'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <ApplicationStatusBadge
                      status={
                        resolveApplicationStatus(profile) as ApplicationStatus
                      }
                    />
                    <Badge variant="accent">{profile.role ?? 'member'}</Badge>
                  </div>
                </div>

                {profile.membership_intent ? (
                  <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                    <span className="font-medium text-foreground">Intent: </span>
                    {profile.membership_intent}
                  </p>
                ) : null}

                {profile.id === viewer.userId ? (
                  <p className="mt-4 text-sm font-medium text-muted-foreground">
                    Current account — role changes disabled
                  </p>
                ) : (
                  <div className="mt-4 border-t border-border pt-4">
                    <RoleUpdate
                      userId={profile.id}
                      currentRole={profile.role ?? 'member'}
                    />
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
