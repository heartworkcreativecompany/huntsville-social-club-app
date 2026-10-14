import Link from 'next/link'
import { redirect } from 'next/navigation'
import ApplicationStatusBadge from '@/components/application/application-status-badge'
import Card from '@/components/ui/card'
import EmptyState from '@/components/ui/empty-state'
import PageHeader from '@/components/ui/page-header'
import AdminMemberManagementCard from '@/components/admin/admin-member-management-card'
import MemberDirectoryBrowser from '@/components/members/member-directory-browser'
import { MembersDashboardLayout } from '@/components/members/members-dashboard-layout'
import { loadDirectoryPage } from '@/lib/load-directory-profiles'
import {
  directoryHref,
  parseDirectoryQuery,
  type MemberDirectorySearchParams,
} from '@/lib/member-directory-query'
import { getViewer } from '@/lib/viewer'

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<MemberDirectorySearchParams>
}) {
  const viewer = await getViewer()

  if (!viewer) {
    return null
  }

  const isAdmin = viewer.role === 'admin'
  const canBrowseDiscovery = viewer.canAccessApp
  const directoryQuery = parseDirectoryQuery(await searchParams)
  const directory = await loadDirectoryPage(
    viewer.userId,
    canBrowseDiscovery,
    isAdmin,
    directoryQuery
  )

  if (
    canBrowseDiscovery &&
    !directory.error &&
    directoryQuery.page !== directory.page
  ) {
    redirect(
      directoryHref('/members', {
        ...directoryQuery,
        page: directory.page,
      })
    )
  }

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
          {directory.error ? (
            <MemberDirectoryBrowser
              members={[]}
              matchCount={0}
              eligibleCount={Math.max(directory.eligibleCount, 1)}
              page={directory.page}
              browseState={directoryQuery.browse}
              search={directoryQuery.search}
              loadError={directory.error}
            />
          ) : canBrowseDiscovery && directory.eligibleCount > 0 ? (
            <MemberDirectoryBrowser
              members={directory.members}
              matchCount={directory.matchCount}
              eligibleCount={directory.eligibleCount}
              page={directory.page}
              browseState={directoryQuery.browse}
              search={directoryQuery.search}
            />
          ) : canBrowseDiscovery ? (
            <EmptyState
              title="No members to discover yet"
              description="As the roster grows, verified profiles will appear here."
            />
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
