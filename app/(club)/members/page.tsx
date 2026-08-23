import Link from 'next/link'
import ApplicationStatusBadge from '@/components/application/application-status-badge'
import Card from '@/components/ui/card'
import EmptyState from '@/components/ui/empty-state'
import PageHeader from '@/components/ui/page-header'
import CuratedIntroCard from '@/components/members/curated-intro-card'
import MemberDirectorySection from '@/components/members/member-directory-section'
import { MembersDashboardLayout } from '@/components/members/members-dashboard-layout'
import RecentMessagesPreview from '@/components/messages/recent-messages-preview'
import { loadDirectoryProfiles } from '@/lib/load-directory-profiles'
import { loadRecentMessagePreviews } from '@/lib/member-messages'
import { buildMemberEntitlementsWithOverride } from '@/lib/load-member-entitlements'
import { createClient } from '@/lib/supabase/server'
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

  // Messaging gate only — membership usage (credits/tier) lives on Your Profile.
  const canMessage = (
    await buildMemberEntitlementsWithOverride({
      userId: viewer.userId,
      role: viewer.role,
      billing: viewer.profile?.membership_billing,
      applicationApproved: viewer.canAccessApp,
      activeCycle: null,
    })
  ).canMessage

  const supabase = await createClient()
  const { previews: messagePreviews, error: messagesError } =
    canBrowseDiscovery && canMessage
      ? await loadRecentMessagePreviews(supabase, viewer.userId, 3)
      : { previews: [], error: null }

  const showRecentMessages = canBrowseDiscovery && canMessage

  return (
    <MembersDashboardLayout
      heading={
        <PageHeader
          eyebrow="Discovery"
          title="Members"
          description="Your dashboard for curated intros, member discovery, and recent conversations."
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
          <div className="mb-6">
            <p className="eyebrow">Directory</p>
            <h2 className="text-display mt-1 text-xl font-semibold">
              Member directory
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Browse verified members by how you want to connect — networking,
              dating, friends, or everyone.
            </p>
          </div>

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
        viewer.role === 'admin' ? (
          <Card className="mb-10" padding="sm">
            <h2 className="text-display text-lg font-semibold">Administrator</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Manage member roles and review the roster.
            </p>
            <Link
              href="/admin/users"
              className="mt-4 inline-block text-sm font-medium text-accent underline"
            >
              Manage users →
            </Link>
          </Card>
        ) : undefined
      }
      recentMessages={
        showRecentMessages ? (
          <div className="mb-10">
            <RecentMessagesPreview
              previews={messagePreviews}
              error={messagesError}
            />
          </div>
        ) : undefined
      }
      curatedIntro={
        viewer.canAccessApp ? (
          <section className="mb-10">
            <CuratedIntroCard />
          </section>
        ) : undefined
      }
    />
  )
}
