import Link from 'next/link'
import { redirect } from 'next/navigation'
import ConversationViewport from '@/components/messages/conversation-viewport'
import MessageThread from '@/components/messages/message-thread'
import MessagingSuspendedNotice from '@/components/messages/messaging-suspended-notice'
import Card from '@/components/ui/card'
import PageHeader from '@/components/ui/page-header'
import { loadAcceptedIdentityStatus } from '@/lib/identity-verification-access'
import {
  IDENTITY_LOOKUP_UNAVAILABLE_MESSAGE,
  IDENTITY_REQUIRED_BEFORE_MESSAGING,
} from '@/lib/identity-verification'
import { loadConversationThread } from '@/lib/member-messages'
import { isMessagingSuspended } from '@/lib/messaging-suspension'
import { createAdminClient } from '@/lib/supabase/admin'
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

  const identityStatus = await loadAcceptedIdentityStatus(
    createAdminClient(),
    viewer.userId
  )
  const messagingSuspended = isMessagingSuspended(viewer.profile)
  const supabase = await createClient()

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
            This link does not open a conversation you can view.
          </p>
          <Link
            href="/messages"
            className="mt-4 inline-flex text-sm font-medium text-accent underline"
          >
            Back to messages
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
        messagingSuspended={messagingSuspended}
        identitySendBlock={
          identityStatus === 'verified'
            ? null
            : identityStatus === 'unavailable'
              ? IDENTITY_LOOKUP_UNAVAILABLE_MESSAGE
              : IDENTITY_REQUIRED_BEFORE_MESSAGING
        }
        canMarkRead={identityStatus === 'verified'}
        status={thread.status}
        viewerIsInitiator={thread.viewerIsInitiator}
        recontactStatus={thread.recontactStatus}
      />
    </ConversationViewport>
  )
}
