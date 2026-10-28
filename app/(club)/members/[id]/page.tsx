import Link from 'next/link'
import { redirect } from 'next/navigation'
import { MemberProfileViewTracker } from '@/components/analytics/page-view-tracker'
import EmptyState from '@/components/ui/empty-state'
import MemberProfilePresentation from '@/components/members/member-profile-presentation'
import MemberProfileMessagePanel from '@/components/members/member-profile-message-panel'
import { loadMemberProfile } from '@/lib/load-directory-profiles'
import {
  loadApprovedVouchEndorsements,
  loadViewerVouchesForMember,
  loadVouchSummaryForMember,
} from '@/lib/load-member-vouches'
import { loadAcceptedIdentityStatus } from '@/lib/identity-verification-access'
import {
  memberFirstNameForMessaging,
  resolveProfileMessageRecipientId,
} from '@/lib/member-profile-messaging'
import { createAdminClient } from '@/lib/supabase/admin'
import { getViewer } from '@/lib/viewer'

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function MemberDetailPage({ params }: PageProps) {
  const { id } = await params
  const viewer = await getViewer()

  if (!viewer) {
    redirect('/login')
  }

  const isAdmin = viewer.role === 'admin'
  const isSelf = id === viewer.userId
  const canBrowseDiscovery = viewer.canAccessApp
  const { member, profileDetails, error } = await loadMemberProfile(
    id,
    viewer.userId,
    canBrowseDiscovery,
    isAdmin
  )

  if (!canBrowseDiscovery && !isSelf) {
    return (
      <>
        <Link
          href="/members"
          className="mb-6 inline-block text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to members
        </Link>
        <EmptyState
          title="Profile not available"
          description="Member profiles are available after your membership application is approved."
          action={
            <Link
              href="/application"
              className="text-sm font-medium text-accent underline"
            >
              Continue application
            </Link>
          }
        />
      </>
    )
  }

  if (error || !member) {
    return (
      <>
        <Link
          href="/members"
          className="mb-6 inline-block text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to members
        </Link>
        <EmptyState
          title="Member not found"
          description={
            error ??
            'This profile may be private or no longer available.'
          }
        />
      </>
    )
  }

  const canVouch = canBrowseDiscovery && !isSelf
  const vouchSummary = await loadVouchSummaryForMember(member.id)
  const vouchEndorsements = await loadApprovedVouchEndorsements(member.id)
  const viewerVouches = canVouch
    ? await loadViewerVouchesForMember(viewer.userId, member.id)
    : []

  const senderIdentity = await loadAcceptedIdentityStatus(
    createAdminClient(),
    viewer.userId
  )
  const recipientIdentity = await loadAcceptedIdentityStatus(
    createAdminClient(),
    member.id
  )

  const messageRecipientId = resolveProfileMessageRecipientId(member.id)
  const firstName = memberFirstNameForMessaging(member.full_name)

    
  return (
    <>
      <MemberProfileViewTracker memberId={member.id} />
      <Link
        href="/members"
        className="mb-6 inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to members
      </Link>

      <MemberProfilePresentation
        member={member}
        isCurrentUser={isSelf}
        limited={!isAdmin}
        details={profileDetails}
        vouchSummary={vouchSummary}
        vouchEndorsements={vouchEndorsements}
        viewerVouches={viewerVouches}
        canVouch={canVouch}
        footer={
          isSelf ? (
            <p className="text-sm text-muted-foreground">
              <Link href="/profile" className="font-medium text-accent underline">
                Edit your profile
              </Link>{' '}
              to update your bio, connection options, and public details.
            </p>
          ) : null
        }
      />

      {!isSelf ? (
        <div className="mt-8">
          <MemberProfileMessagePanel
            targetMemberId={messageRecipientId}
            firstName={firstName}
            senderIdentity={senderIdentity}
            recipientIdentity={recipientIdentity}
            isSelf={false}
          />
        </div>
      ) : null}
    </>
  )
}
