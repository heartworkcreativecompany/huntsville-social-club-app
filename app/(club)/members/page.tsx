import Link from 'next/link'
import ApplicationStatusBadge from '@/components/application/application-status-badge'
import Card from '@/components/ui/card'
import EmptyState from '@/components/ui/empty-state'
import PageHeader from '@/components/ui/page-header'
import AdminMemberManagementCard from '@/components/admin/admin-member-management-card'
import MemberDirectorySection from '@/components/members/member-directory-section'
import { MembersDashboardLayout } from '@/components/members/members-dashboard-layout'
import { loadDirectoryProfiles } from '@/lib/load-directory-profiles'
import { getViewer } from '@/lib/viewer'

export default async function MembersPage() {
  const viewer = await getViewer()

  if (!viewer) {
    return null
  }

  const isAdmin = viewer.role === 'admin'
  const canBrowseDiscovery = viewer.canAccessApp
  const { members: directoryMembers, error: directoryError } =
    await loadDirectoryProfiles(viewer.userId, canBrowseDiscovery, isAdmin)

  return (
    <MembersDashboardLayout
      heading={
        <PageHeader
          eyebrow="Directory"
          title="Member directory"
          description="Browse verified members by how you want to connect — networking, dating, friends, or everyone."
          actions={<ApplicationStatusBadge status={viewer.applicationStatus} />}
        />
      }
      approvalNotice={
        !viewer.canAccessApp ? (
          <Card className="mb-8 border-warning/30 bg-warning-soft/40" padding="sm">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Discovery unlocks after approval. Continue your{' '}
              <Link href="/application" className="font-medium text-accent underline">
                membership application
              </Link>
              .
            </p>
          </Card>
        ) : undefined
      }
      directory={
        <section className="mb-12">
          {directoryError ? (
            <p className="text-sm text-danger">
              Could not load directory: {directoryError}
            </p>
          ) : canBrowseDiscovery ? (
            <MemberDirectorySection members={directoryMembers} />
          ) : (
            <EmptyState
              title="Membership approval required"
              description="Complete your application and receive approval to browse the verified member directory."
              action={
                <Link
                  href="/application"
                  className="text-sm font-medium text-accent underline"
                >
                  Continue application
                </Link>
              }
            />
          )}
        </section>
      }
      admin={
        viewer.role === 'admin' ? <AdminMemberManagementCard /> : undefined
      }
    />
  )
}
