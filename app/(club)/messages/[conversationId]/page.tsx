import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import CuratedIntroMessagingNotice from '@/components/messages/curated-intro-messaging-notice'
import MessageThread from '@/components/messages/message-thread'
import MessagingSuspendedNotice from '@/components/messages/messaging-suspended-notice'
import PageHeader from '@/components/ui/page-header'
import { MessagingPaywall } from '@/components/membership/feature-paywalls'
import { resolveMemberMessagingAccess } from '@/lib/curated-intro-messaging-access'
import {
  loadConversationThread,
  markConversationMessagesRead,
} from '@/lib/member-messages'
import { loadMemberEntitlementsForViewer } from '@/lib/load-member-entitlements'
import { isMessagingSuspended } from '@/lib/messaging-suspension'
import { createClient } from '@/lib/supabase/server'
import { getViewer } from '@/lib/viewer'

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>
}) {
  const { conversationId } = await params
  const viewer = await getViewer()

  if (!viewer) {
    redirect('/login')
  }

  if (!viewer.canAccessApp) {
    redirect('/application')
  }

  const { entitlements } = await loadMemberEntitlementsForViewer()
  const messagingSuspended = isMessagingSuspended(viewer.profile)
  const supabase = await createClient()
  const access = await resolveMemberMessagingAccess(supabase, {
    userId: viewer.userId,
    canMessage: entitlements?.canMessage ?? false,
    messagingSuspended,
    conversationId,
  })

  if (!access.canAccessConversation) {
    return (
      <>
        <PageHeader
          eyebrow="Inbox"
          title="Messages"
          description="This conversation is only available to participants in the message request."
        />
        <MessagingPaywall membershipsHref="/upgrade" />
      </>
    )
  }

  const { thread, error } = await loadConversationThread(
    supabase,
    viewer.userId,
    conversationId
  )

  if (error) {
    return <p className="text-sm text-danger">{error}</p>
  }

  if (!thread) {
    notFound()
  }

  await markConversationMessagesRead(supabase, viewer.userId, conversationId)

  return (
    <>
      <PageHeader
        eyebrow="Inbox"
        title="Messages"
        description={`Private conversation with ${thread.otherUserName}.`}
        actions={
          <Link
            href="/messages"
            className="text-sm font-medium text-accent underline"
          >
            All conversations
          </Link>
        }
      />

      {messagingSuspended ? <MessagingSuspendedNotice /> : null}
      {access.introOnlyAccess ? <CuratedIntroMessagingNotice /> : null}

      <MessageThread
        conversationId={thread.conversationId}
        otherUserName={thread.otherUserName}
        initialMessages={thread.messages}
        initialUnreadCount={thread.unreadCount}
        initialBlockState={thread.blockState}
        initialReportState={thread.reportState}
        messagingSuspended={messagingSuspended}
        status={thread.status}
        viewerIsInitiator={thread.viewerIsInitiator}
        recontactStatus={thread.recontactStatus}
      />
    </>
  )
}
