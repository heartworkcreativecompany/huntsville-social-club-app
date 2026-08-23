import { redirect } from 'next/navigation'
import ApplicationStatusBadge from '@/components/application/application-status-badge'
import Card from '@/components/ui/card'
import PageHeader from '@/components/ui/page-header'
import MemberProfileCard from '@/components/members/member-profile-card'
import MembershipUsageCard from '@/components/membership/membership-usage-card'
import ProfileStrengthModule from '@/components/profile/profile-strength-module'
import ProfileRevisionStatusCard from '@/components/profile/profile-revision-status-card'
import ProfilePendingPhotosCard from '@/components/profile/profile-pending-photos-card'
import ProfileRevisionHistoryModule from '@/components/profile/profile-revision-history-module'
import CompatibilityStatusModule from '@/components/profile/compatibility-status-module'
import FriendshipStatusModule from '@/components/profile/friendship-status-module'
import VerificationStatusModule from '@/components/profile/verification-status-module'
import { compatibilityContextForViewer } from '@/lib/compatibility/viewer-context'
import { summarizeMemberMatchAvailability } from '@/lib/compatibility/member-match-availability'
import { loadMemberDeliverySnapshot } from '@/lib/load-member-delivery-snapshot'
import { syncRecommendationLifecycleForMember } from '@/lib/curated-recommendation-lifecycle'
import { publicProfileDetailsFromDraft } from '@/lib/application-profile-preview'
import { mergeProfileIntoDraft } from '@/lib/application-draft-sync'
import MemberPublicDetails from '@/components/members/member-public-details'
import { buildDirectoryMember } from '@/lib/members-discovery'
import { photosFromApplicationDraft } from '@/lib/member-photos'
import { computeProfileCompletion } from '@/lib/profile-completion'
import { parseVerificationState } from '@/lib/membership-systems'
import { getViewer } from '@/lib/viewer'
import ProfileContactEmailCard from '@/components/profile/profile-contact-email-card'
import ProfilePhoneVerificationCard from '@/components/profile/profile-phone-verification-card'
import ProfileForm from '@/app/(club)/members/profile-form'
import { loadMemberEntitlementsForViewer } from '@/lib/load-member-entitlements'
import { createClient } from '@/lib/supabase/server'
import { attachPublicRecognitionBadges } from '@/lib/recognition-badges/public'
import { isMessagingSuspended } from '@/lib/messaging-suspension'
import { loadOwnFriendshipQuestionnaire } from '@/lib/friendship/candidate-pool'
import { friendshipContextForViewer } from '@/lib/friendship/viewer-context'
import {
  buildProfileRevisionDiff,
  editorPhotosForRevision,
  liveProfileFormValues,
  liveProfileRevisionSnapshot,
  parseProfilePendingRevision,
  pendingProfileFormValues,
  profileRevisionStatusFromDb,
} from '@/lib/profile-revision'

export default async function YourProfilePage() {
  const viewer = await getViewer()

  if (!viewer) {
    redirect('/login')
  }

  if (!viewer.canAccessApp) {
    redirect('/application')
  }

  const profile = viewer.profile
  const liveDraft = mergeProfileIntoDraft(profile)
  const profilePreview = publicProfileDetailsFromDraft(liveDraft, {
    connectionsOpenTo: profile?.connections_open_to,
  })
  const completion = computeProfileCompletion(profile, liveDraft)

  const revisionStatus = profileRevisionStatusFromDb(
    profile?.profile_revision_status ?? null
  )
  const pendingRevision = parseProfilePendingRevision(
    profile?.profile_pending_revision
  )
  const liveSnapshot = liveProfileRevisionSnapshot({
    full_name: profile?.full_name ?? null,
    membership_intent: profile?.membership_intent ?? null,
    location_area: profile?.location_area ?? null,
    application_draft: profile?.application_draft,
    connections_open_to: profile?.connections_open_to,
    connection_intents: profile?.connection_intents,
    discovery_interests: profile?.discovery_interests,
  })
  const liveFormValues = liveProfileFormValues({
    full_name: profile?.full_name ?? null,
    membership_intent: profile?.membership_intent ?? null,
    location_area: profile?.location_area ?? null,
    application_draft: profile?.application_draft,
    connections_open_to: profile?.connections_open_to,
    connection_intents: profile?.connection_intents,
    discovery_interests: profile?.discovery_interests,
  })
  const formValues =
    revisionStatus === 'pending' && pendingRevision
      ? pendingProfileFormValues(pendingRevision, liveFormValues)
      : liveFormValues
  const revisionDiff =
    revisionStatus === 'pending' && pendingRevision
      ? buildProfileRevisionDiff(liveSnapshot, pendingRevision)
      : null
  const changedFields = revisionDiff?.changedFields ?? []
  const livePhotos = photosFromApplicationDraft(profile?.application_draft)
  const editorPhotos = editorPhotosForRevision({
    revisionStatus,
    livePhotos,
    pendingRevision,
  })
  const showPendingPhotosCard =
    revisionStatus === 'pending' &&
    revisionDiff?.photos.changed === true

  const { entitlements } = await loadMemberEntitlementsForViewer()
  const currentMember = profile
    ? buildDirectoryMember(
        {
          ...profile,
          application_status: profile.application_status,
        },
        { accessOverride: entitlements?.accessOverride ?? null }
      )
    : null

  if (currentMember) {
    currentMember.photos = livePhotos
  }
  const { summary: compatibilitySummary } = compatibilityContextForViewer(
    viewer,
    entitlements
  )
  const supabase = await createClient()
  if (currentMember) {
    const [withBadges] = await attachPublicRecognitionBadges(supabase, [
      currentMember,
    ])
    currentMember.recognitionBadges = withBadges.recognitionBadges ?? []
  }
  const friendshipQuestionnaire = await loadOwnFriendshipQuestionnaire(
    supabase,
    viewer.userId
  )
  const { access: friendshipAccess } = friendshipContextForViewer(
    viewer,
    entitlements,
    friendshipQuestionnaire
  )

  let matchAvailabilityHeadline = compatibilitySummary.headline
  let matchAvailabilityDetail = compatibilitySummary.detail
  let matchDeliveryLines: string[] | undefined

  if (compatibilitySummary.status === 'active') {
    await syncRecommendationLifecycleForMember(supabase, viewer.userId)
    const deliverySnapshot = await loadMemberDeliverySnapshot(supabase, viewer.userId, {
      lastMatchGenerationAt: profile?.last_match_generation_at ?? null,
      lastMatchReviewAt: profile?.last_match_review_at ?? null,
    })
    const availability = summarizeMemberMatchAvailability({
      lastMatchGenerationAt: deliverySnapshot.lastMatchGenerationAt,
      lastMatchReviewAt: deliverySnapshot.lastMatchReviewAt,
      compatibilityCompletedAt: profile?.compatibility_completed_at ?? null,
      latestBatch: deliverySnapshot.latestBatch,
      activeRecommendationCount: deliverySnapshot.activeRecommendationCount,
      archivedRecommendationCount: deliverySnapshot.archivedRecommendationCount,
      messagingSuspended: isMessagingSuspended(profile),
    })
    if (availability.situation !== 'has_active') {
      matchAvailabilityHeadline = availability.headline
    }
    matchAvailabilityDetail = availability.detail
    matchDeliveryLines = availability.deliveryLines
  }

  const messagingSuspendedForMatches =
    compatibilitySummary.status === 'active' && isMessagingSuspended(profile)

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Your Profile"
        description="Manage how you show up in the club — photos, details, verification, and membership status."
        actions={<ApplicationStatusBadge status={viewer.applicationStatus} />}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section className="space-y-6">
          <ProfileRevisionStatusCard
            status={revisionStatus}
            submittedAt={profile?.profile_revision_submitted_at ?? null}
            adminNotes={profile?.profile_revision_admin_notes ?? null}
            changedFields={changedFields}
          />

          {showPendingPhotosCard && revisionDiff ? (
            <ProfilePendingPhotosCard
              memberId={viewer.userId}
              livePhotos={revisionDiff.photos.live}
              pendingPhotos={revisionDiff.photos.pending}
            />
          ) : null}

          {currentMember ? (
            <Card>
              <p className="eyebrow">Public preview</p>
              <h2 className="text-display mt-1 text-lg font-semibold">
                How members see you (live)
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                This reflects your approved profile. Pending edits are not shown
                here until staff approves them.
              </p>
              <div className="mt-4 space-y-4">
                <MemberProfileCard
                  member={currentMember}
                  isCurrentUser
                  href={`/members/${viewer.userId}`}
                />
                <MemberPublicDetails details={profilePreview} compact omitHeaderFields />
              </div>
            </Card>
          ) : null}

          <ProfileContactEmailCard
            contactEmail={profile?.contact_email ?? ''}
            showContactEmail={profile?.show_contact_email ?? false}
          />

          <ProfilePhoneVerificationCard
            verifiedPhoneE164={profile?.verified_phone_e164 ?? null}
            phoneVerified={
              parseVerificationState(profile?.verification_state).phone ===
              'approved'
            }
            authPhoneE164={viewer.authPhone}
          />

          <ProfileForm
            memberId={viewer.userId}
            displayName={formValues.displayName}
            bio={formValues.bio}
            locationArea={formValues.locationArea}
            memberPublicIntents={formValues.memberPublicIntents}
            interests={formValues.interests}
            occupation={formValues.occupation}
            industry={formValues.industry}
            lifestyleTags={formValues.lifestyleTags}
            eventInterests={formValues.eventInterests}
            socialVibe={formValues.socialVibe}
            connectionsOpenTo={formValues.connectionsOpenTo}
            perfectWeekend={formValues.perfectWeekend}
            favoriteLocalActivities={formValues.favoriteLocalActivities}
            icebreaker={formValues.icebreaker}
            livePhotos={livePhotos}
            editorPhotos={editorPhotos}
            revisionStatus={revisionStatus}
            pendingFieldLabels={changedFields}
          />
        </section>

        <aside className="space-y-6">
          {entitlements ? (
            <MembershipUsageCard entitlements={entitlements} />
          ) : null}

          <ProfileStrengthModule
            percent={completion.percent}
            items={completion.items}
          />

          {compatibilitySummary.showCard ? (
            <CompatibilityStatusModule
              headline={matchAvailabilityHeadline}
              detail={matchAvailabilityDetail}
              status={compatibilitySummary.status}
              ctaHref={compatibilitySummary.ctaHref}
              ctaLabel={compatibilitySummary.ctaLabel}
              deliveryLines={matchDeliveryLines}
              messagingSuspended={messagingSuspendedForMatches}
            />
          ) : null}

          {friendshipAccess.canViewSection ? (
            <FriendshipStatusModule
              headline={friendshipAccess.headline}
              detail={friendshipAccess.detail}
              status={friendshipAccess.status}
              ctaHref={friendshipAccess.ctaHref}
              ctaLabel={friendshipAccess.ctaLabel}
            />
          ) : null}

          {currentMember ? (
            <VerificationStatusModule
              applicationStatus={viewer.applicationStatus}
              member={currentMember}
              approvalGatesRaw={profile?.approval_gates}
            />
          ) : null}

          <ProfileRevisionHistoryModule
            historyRaw={profile?.profile_revision_history}
          />
        </aside>
      </div>
    </>
  )
}
