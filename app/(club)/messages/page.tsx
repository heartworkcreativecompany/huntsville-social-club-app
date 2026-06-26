import { redirect } from 'next/navigation'
import PageHeader from '@/components/ui/page-header'
import MessagesInbox from '@/components/messages/messages-inbox'
import { MessagingPaywall } from '@/components/membership/feature-paywalls'
import { loadInboxPreviews } from '@/lib/member-messages'
import { loadMemberEntitlementsForViewer } from '@/lib/load-member-entitlements'
import { createClient } from '@/lib/supabase/server'
import { getViewer } from '@/lib/viewer'

export default async function MessagesPage() {
  const viewer = await getViewer()

  if (!viewer) {
    redirect('/login')
  }

  if (!viewer.canAccessApp) {
    redirect('/application')
  }

  const { entitlements } = await loadMemberEntitlementsForViewer()

  if (!entitlements?.canMessage) {
    return (
      <>
        <PageHeader
          eyebrow="Inbox"
          title="Messages"
          description="Conversations with members you have connected with through intros and events."
        />
        <MessagingPaywall membershipsHref="/upgrade" />
      </>
    )
  }

  const supabase = await createClient()
  const { previews, error } = await loadInboxPreviews(supabase, viewer.userId)

  return (
    <>
      <PageHeader
        eyebrow="Inbox"
        title="Messages"
        description="Conversations with members you have connected with through intros and events."
      />

      <MessagesInbox previews={previews} error={error} />
    </>
  )
}
