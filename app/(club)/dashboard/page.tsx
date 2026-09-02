import { redirect } from 'next/navigation'
import ApplicationStatusBadge from '@/components/application/application-status-badge'
import ActionNeeded from '@/components/dashboard/action-needed'
import RecentMatchesPreview, {
  selectDatingMatchPreviews,
  selectFriendshipMatchPreviews,
} from '@/components/dashboard/recent-matches-preview'
import RecentNotifications, {
  DASHBOARD_NOTIFICATION_PREVIEW_LIMIT,
} from '@/components/dashboard/recent-notifications'
import UpcomingEventsPreview from '@/components/dashboard/upcoming-events-preview'
import CuratedIntroCard from '@/components/members/curated-intro-card'
import RecentMessagesPreview from '@/components/messages/recent-messages-preview'
import PageHeader from '@/components/ui/page-header'
import { mergeProfileIntoDraft } from '@/lib/application-draft-sync'
import { canAccessMatchesInbox } from '@/lib/compatibility/matches-access'
import { compatibilityContextForViewer } from '@/lib/compatibility/viewer-context'
import { buildDashboardActionNeeded } from '@/lib/dashboard/action-needed'
import { loadOwnFriendshipQuestionnaire } from '@/lib/friendship/candidate-pool'
import { isFriendshipMatchingEnabled } from '@/lib/friendship/eligibility'
import { loadFriendshipMatchRecommendations } from '@/lib/friendship/load-matches'
import { resolveFriendshipMatchesView } from '@/lib/friendship/matching-flag'
import { friendshipContextForViewer } from '@/lib/friendship/viewer-context'
import { loadCuratedMatchRecommendations } from '@/lib/load-curated-matches'
import { loadMemberEntitlementsForViewer } from '@/lib/load-member-entitlements'
import { loadMemberNotifications } from '@/lib/load-member-notifications'
import { loadUpcomingEventsPreview } from '@/lib/load-upcoming-events'
import { loadRecentMessagePreviews } from '@/lib/member-messages'
import { computeProfileCompletion } from '@/lib/profile-completion'
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

  const supabase = await createClient()
  const [{ entitlements }, friendshipQuestionnaire] = await Promise.all([
    loadMemberEntitlementsForViewer(),
    loadOwnFriendshipQuestionnaire(supabase, viewer.userId).catch(() => null),
  ])

  const canMessage = entitlements?.canMessage ?? false
  const datingContext = compatibilityContextForViewer(viewer, entitlements)
  const friendshipContext = friendshipContextForViewer(
    viewer,
    entitlements,
    friendshipQuestionnaire
  )
  const canLoadDatingRecommendations = canAccessMatchesInbox(datingContext.summary)
  const friendsView = resolveFriendshipMatchesView({
    canViewMatches: friendshipContext.access.canViewMatches,
  })
  const canLoadFriendshipRecommendations = friendsView.loadRecommendations

  const liveDraft = mergeProfileIntoDraft(viewer.profile)
  const completion = computeProfileCompletion(viewer.profile, liveDraft)
  const actionNeededCards = buildDashboardActionNeeded({
    datingStatus: datingContext.summary.status,
    friendshipStatus: friendshipContext.access.status,
    profileCompletionPercent: completion.percent,
    datingMatchingEnabled: datingContext.featureEnabled,
    friendshipMatchingEnabled: isFriendshipMatchingEnabled(),
  })

  const datingRecommendationsPromise = canLoadDatingRecommendations
    ? loadCuratedMatchRecommendations(supabase, viewer.userId, {
        viewerInterests: viewer.profile?.discovery_interests ?? null,
      })
    : Promise.resolve({ items: [], error: null })

  const friendshipRecommendationsPromise = canLoadFriendshipRecommendations
    ? loadFriendshipMatchRecommendations(supabase, viewer.userId)
    : Promise.resolve({ items: [], error: null })

  const [
    notificationResult,
    upcomingResult,
    messageResult,
    datingLoaded,
    friendsLoaded,
  ] = await Promise.all([
    loadMemberNotifications(
      supabase,
      viewer.userId,
      DASHBOARD_NOTIFICATION_PREVIEW_LIMIT
    )
      .then((result) => ({ items: result.items, error: null }))
      .catch(() => ({
        items: [],
        error: 'Unable to load notifications.',
      })),
    loadUpcomingEventsPreview(supabase, {
      userId: viewer.userId,
      role: viewer.role,
    }),
    canMessage
      ? loadRecentMessagePreviews(supabase, viewer.userId, 3)
      : Promise.resolve({ previews: [], error: null }),
    datingRecommendationsPromise,
    friendshipRecommendationsPromise,
  ])

  const datingPreviews = canLoadDatingRecommendations
    ? selectDatingMatchPreviews(datingLoaded.items)
    : []
  const friendPreviews = canLoadFriendshipRecommendations
    ? selectFriendshipMatchPreviews(friendsLoaded.items)
    : []

  return (
    <>
      <PageHeader
        eyebrow="Discovery"
        title="Dashboard"
        description="Your latest updates and next steps for curated intros, member discovery, and recent conversations."
        actions={<ApplicationStatusBadge status={viewer.applicationStatus} />}
      />

      {actionNeededCards.length > 0 ? (
        <div className="mb-10">
          <ActionNeeded cards={actionNeededCards} />
        </div>
      ) : null}

      <div className="mb-10">
        <RecentNotifications
          items={notificationResult.items}
          error={notificationResult.error}
        />
      </div>

      <div className="mb-10">
        <UpcomingEventsPreview
          events={upcomingResult.events}
          error={upcomingResult.error}
        />
      </div>

      {datingPreviews.length > 0 || friendPreviews.length > 0 ? (
        <div className="mb-10">
          <RecentMatchesPreview dating={datingPreviews} friends={friendPreviews} />
        </div>
      ) : null}

      {canMessage ? (
        <div className="mb-10">
          <RecentMessagesPreview
            previews={messageResult.previews}
            error={messageResult.error}
          />
        </div>
      ) : null}

      <section className="mb-10">
        <CuratedIntroCard />
      </section>
    </>
  )
}
