import { redirect } from 'next/navigation'
import ApplicationStatusBadge from '@/components/application/application-status-badge'
import CuratedIntroCard from '@/components/members/curated-intro-card'
import RecentMessagesPreview from '@/components/messages/recent-messages-preview'
import PageHeader from '@/components/ui/page-header'
import { loadRecentMessagePreviews } from '@/lib/member-messages'
import { buildMemberEntitlementsWithOverride } from '@/lib/load-member-entitlements'
import { createClient } from '@/lib/supabase/server'
import { getViewer } from '@/lib/viewer'

export default async function DashboardPage() {
  const viewer = await getViewer()

  if (!viewer) {
    redirect('/login')
  }

  if (!viewer.canAccessApp) {
    redirect('/application')
  }

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
  const { previews: messagePreviews, error: messagesError } = canMessage
    ? await loadRecentMessagePreviews(supabase, viewer.userId, 3)
    : { previews: [], error: null }

  return (
    <>
      <PageHeader
        eyebrow="Discovery"
        title="Dashboard"
        description="Your latest updates and next steps for curated intros, member discovery, and recent conversations."
        actions={<ApplicationStatusBadge status={viewer.applicationStatus} />}
      />

      {canMessage ? (
        <div className="mb-10">
          <RecentMessagesPreview
            previews={messagePreviews}
            error={messagesError}
          />
        </div>
      ) : null}

      <section className="mb-10">
        <CuratedIntroCard />
      </section>
    </>
  )
}
