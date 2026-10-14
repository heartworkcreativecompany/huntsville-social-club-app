import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdminClient } from '@/lib/supabase/require-admin-client'
import Badge from '@/components/ui/badge'
import Card from '@/components/ui/card'
import EmptyState from '@/components/ui/empty-state'
import PageHeader from '@/components/ui/page-header'
import ApplicationStatusBadge from '@/components/application/application-status-badge'
import AdminUserSearch from '@/components/admin/admin-user-search'
import { resolveApplicationStatus, type ApplicationStatus } from '@/lib/application'
import {
  adminUserSearchOrFilter,
  countPendingApplications,
  normalizeAdminUserSearch,
} from '@/lib/admin-user-search'
import { getViewer } from '@/lib/viewer'
import RoleUpdate from './role-update'
import RemoveMemberButton from '@/components/admin/remove-member-button'

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>
}) {
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

  const supabase = requireAdminClient()
  const search = normalizeAdminUserSearch((await searchParams).q)

  const [{ data: users, error }, { data: statusRows, error: statusError }] =
    await Promise.all([
      loadAdminUserRows(supabase, search),
      loadAdminStatusRows(supabase),
    ])

  const pendingCount = statusError
    ? null
    : countPendingApplications(statusRows ?? [])

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="User management"
        description="Review applications, assign roles, and maintain a high-trust member roster."
        actions={
          pendingCount === null ? undefined : pendingCount > 0 ? (
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

      <AdminUserSearch search={search} />

      {error ? (
        <p className="text-sm text-danger">Could not load users: {error.message}</p>
      ) : !users?.length ? (
        <EmptyState
          title={search ? 'No matching users' : 'No users found'}
          description={
            search ? 'Try a different name or email.' : undefined
          }
        />
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
                    <span className="font-medium text-foreground">Bio: </span>
                    {profile.membership_intent}
                  </p>
                ) : null}

                <div className="mt-4 space-y-4 border-t border-border pt-4">
                  <Link
                    href={`/admin/users/${profile.id}`}
                    className="inline-flex text-sm font-medium text-accent underline"
                  >
                    Manage profile
                  </Link>
                  {profile.id === viewer.userId ? (
                    <p className="text-sm font-medium text-muted-foreground">
                      Current account — role changes disabled
                    </p>
                  ) : (
                    <>
                      <RoleUpdate
                        userId={profile.id}
                        currentRole={profile.role ?? 'member'}
                      />
                      <RemoveMemberButton
                        userId={profile.id}
                        memberName={
                          profile.full_name ?? profile.email ?? 'Unknown member'
                        }
                        memberEmail={profile.email}
                        disabled={profile.role === 'admin'}
                        disabledReason={
                          profile.role === 'admin'
                            ? 'Administrator accounts cannot be removed here.'
                            : undefined
                        }
                      />
                    </>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

const ADMIN_USER_FIELDS =
  'id, email, full_name, role, created_at, application_status, membership_intent, verified_at'
const ADMIN_USER_PAGE_SIZE = 1000
const ADMIN_USER_ROW_CAP = 20000

type AdminClient = ReturnType<typeof requireAdminClient>

async function loadAdminUserRows(supabase: AdminClient, search: string) {
  const rows: {
    id: string
    email: string | null
    full_name: string | null
    role: string | null
    created_at: string | null
    application_status: string | null
    membership_intent: string | null
    verified_at: string | null
  }[] = []

  for (let from = 0; from < ADMIN_USER_ROW_CAP; from += ADMIN_USER_PAGE_SIZE) {
    let query = supabase
      .from('profiles')
      .select(ADMIN_USER_FIELDS)
      .order('email', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + ADMIN_USER_PAGE_SIZE - 1)
    if (search) query = query.or(adminUserSearchOrFilter(search))

    const { data, error } = await query
    if (error) return { data: null, error }
    const batch = data ?? []
    rows.push(...batch)
    if (batch.length < ADMIN_USER_PAGE_SIZE) return { data: rows, error: null }
  }

  return {
    data: null,
    error: { message: 'The user list is too large to search completely.' },
  }
}

async function loadAdminStatusRows(supabase: AdminClient) {
  const rows: {
    application_status: string | null
    role: string | null
  }[] = []

  for (let from = 0; from < ADMIN_USER_ROW_CAP; from += ADMIN_USER_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('profiles')
      .select('application_status, role')
      .order('id', { ascending: true })
      .range(from, from + ADMIN_USER_PAGE_SIZE - 1)
    if (error) return { data: null, error }
    const batch = data ?? []
    rows.push(...batch)
    if (batch.length < ADMIN_USER_PAGE_SIZE) return { data: rows, error: null }
  }

  return {
    data: null,
    error: { message: 'Could not count the application queue.' },
  }
}
