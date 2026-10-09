import { redirect } from 'next/navigation'
import MessagingSuspendedNotice from '@/components/messages/messaging-suspended-notice'
import MessagesInbox from '@/components/messages/messages-inbox'
import PageHeader from '@/components/ui/page-header'
import { MessagingPaywall } from '@/components/membership/feature-paywalls'
import { resolveMemberMessagingAccess } from '@/lib/curated-intro-messaging-access'
import { loadInboxPreviews } from '@/lib/member-messages'
import { loadMemberEntitlementsForViewer } from '@/lib/load-member-entitlements'
import { isMessagingSuspended } from '@/lib/messaging-suspension'
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

  const messagingSuspended = isMessagingSuspended(viewer.profile)
  const { entitlements } = await loadMemberEntitlementsForViewer()
  const supabase = await createClient()
  const access = await resolveMemberMessagingAccess(supabase, {
    userId: viewer.userId,
    canMessage: entitlements?.canMessage ?? false,
    messagingSuspended,
    adminModeration: viewer.role === 'admin',
  })

  if (!access.canAccessInbox) {
    return (
      <>
        <PageHeader
          eyebrow="Inbox"
          title="Messages"
          description="An active paid membership is required to read and send messages."
        />
        <MessagingPaywall membershipsHref="/upgrade" />
      </>
    )
  }

  const { previews, error } = await loadInboxPreviews(supabase, viewer.userId)

  return (
    <>
      <PageHeader
        eyebrow="Inbox"
        title="Messages"
        description={
          access.adminModeration && !entitlements?.canMessage
            ? 'Admin moderation view. Your personal membership does not include messaging.'
            : 'Message requests and conversations with members you have connected with.'
        }
      />

      {messagingSuspended ? <MessagingSuspendedNotice /> : null}

      <MessagesInbox previews={previews} error={error} />
    </>
  )
}
