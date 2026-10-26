import Link from 'next/link'
import { redirect } from 'next/navigation'
import ConversationViewport from '@/components/messages/conversation-viewport'
import MessageThread from '@/components/messages/message-thread'
import MessagingSuspendedNotice from '@/components/messages/messaging-suspended-notice'
import Card from '@/components/ui/card'
import PageHeader from '@/components/ui/page-header'
import { MessagingPaywall } from '@/components/membership/feature-paywalls'
import { resolveMemberMessagingAccess } from '@/lib/curated-intro-messaging-access'
import { loadConversationThread } from '@/lib/member-messages'
import { loadMemberEntitlementsForViewer } from '@/lib/load-member-entitlements'
import { MEMBER_MESSAGING_UPGRADE_PATH } from '@/lib/member-profile-messaging'
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
    adminModeration: viewer.role === 'admin',
  })

  if (!access.canAccessConversation) {
    return (
      <>
        <PageHeader
          eyebrow="Inbox"
          title="Messages"
          description="An active paid membership is required to open this conversation."
        />
        <MessagingPaywall membershipsHref={MEMBER_MESSAGING_UPGRADE_PATH} />
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
    return (
      <>
        <PageHeader
          eyebrow="Inbox"
          title="Conversation unavailable"
          description="You do not have access to this conversation."
        />
        <Card>
          <p className="text-sm leading-relaxed text-muted-foreground">
            This link does not open a conversation you can view. If you expected
            a curated intro, an active paid membership is required to message.
          </p>
          <Link
            href={MEMBER_MESSAGING_UPGRADE_PATH}
            className="mt-4 inline-flex text-sm font-medium text-accent underline"
          >
            View memberships
          </Link>
        </Card>
      </>
    )
  }

  return (
    <ConversationViewport>
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

      <MessageThread
        key={thread.conversationId}
        conversationId={thread.conversationId}
        otherUserName={thread.otherUserName}
        initialMessages={thread.messages}
        initialUnreadCount={thread.unreadCount}
        initialBlockState={thread.blockState}
        initialReportState={thread.reportState}
        messagingSuspended={messagingSuspended || !entitlements?.canMessage}
        canMarkRead={Boolean(entitlements?.canMessage)}
        status={thread.status}
        viewerIsInitiator={thread.viewerIsInitiator}
        recontactStatus={thread.recontactStatus}
      />
    </ConversationViewport>
  )
}
