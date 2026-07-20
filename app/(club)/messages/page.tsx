import { redirect } from 'next/navigation'
import CuratedIntroMessagingNotice from '@/components/messages/curated-intro-messaging-notice'
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
  })

  if (!access.canAccessInbox) {
    return (
      <>
        <PageHeader
          eyebrow="Inbox"
          title="Messages"
          description="Private conversations open after a member accepts your message request."
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
          access.introOnlyAccess
            ? 'Your curated intro conversations are open here. Upgrade for broader member messaging.'
            : 'Message requests and conversations with members you have connected with.'
        }
      />

      {messagingSuspended ? <MessagingSuspendedNotice /> : null}
      {access.introOnlyAccess ? <CuratedIntroMessagingNotice /> : null}

      <MessagesInbox previews={previews} error={error} />
    </>
  )
}
