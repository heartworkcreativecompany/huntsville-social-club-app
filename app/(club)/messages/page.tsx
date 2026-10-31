import { redirect } from 'next/navigation'
import IdentityVerificationEntryLink from '@/components/profile/identity-verification-entry-link'
import MessagingSuspendedNotice from '@/components/messages/messaging-suspended-notice'
import MessagesInbox from '@/components/messages/messages-inbox'
import PageHeader from '@/components/ui/page-header'
import { resolveMemberMessagingAccess } from '@/lib/curated-intro-messaging-access'
import { loadAcceptedIdentityStatus } from '@/lib/identity-verification-access'
import {
  IDENTITY_LOOKUP_UNAVAILABLE_MESSAGE,
  IDENTITY_REQUIRED_BEFORE_MESSAGING,
} from '@/lib/identity-verification'
import { loadInboxPreviews } from '@/lib/member-messages'
import { isMessagingSuspended } from '@/lib/messaging-suspension'
import { createAdminClient } from '@/lib/supabase/admin'
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
  const identityStatus = await loadAcceptedIdentityStatus(
    createAdminClient(),
    viewer.userId
  )
  const supabase = await createClient()
  const access = await resolveMemberMessagingAccess(supabase, {
    userId: viewer.userId,
    identityStatus,
    messagingSuspended,
    adminModeration: viewer.role === 'admin',
  })

  const { previews, error } = await loadInboxPreviews(supabase, viewer.userId)
  const identityNotice =
    identityStatus === 'unavailable'
      ? IDENTITY_LOOKUP_UNAVAILABLE_MESSAGE
      : identityStatus === 'verified'
        ? null
        : IDENTITY_REQUIRED_BEFORE_MESSAGING

  return (
    <>
      <PageHeader
        eyebrow="Inbox"
        title="Messages"
        description={
          access.adminModeration && identityStatus === 'unavailable'
            ? 'Admin moderation view. Identity verification could not be confirmed for sending.'
            : access.adminModeration && identityStatus !== 'verified'
              ? 'Admin moderation view. Verify your identity before sending your own messages.'
            : 'Message requests and conversations with members you have connected with.'
        }
      />

      {identityNotice ? (
        <div className="mb-4 grid gap-3">
          <p className="text-sm text-muted-foreground">{identityNotice}</p>
          {identityStatus === 'unverified' ? <IdentityVerificationEntryLink /> : null}
        </div>
      ) : null}
      {messagingSuspended ? <MessagingSuspendedNotice /> : null}

      <MessagesInbox previews={previews} error={error} />
    </>
  )
}
