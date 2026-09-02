import Link from 'next/link'
import { redirect } from 'next/navigation'
import PageHeader from '@/components/ui/page-header'
import EmptyState from '@/components/ui/empty-state'
import Card from '@/components/ui/card'
import FriendshipMatchesList from '@/components/friendship/friendship-matches-list'
import { createClient } from '@/lib/supabase/server'
import { getViewer } from '@/lib/viewer'
import { loadMemberEntitlementsForViewer } from '@/lib/load-member-entitlements'
import { loadOwnFriendshipQuestionnaire } from '@/lib/friendship/candidate-pool'
import { friendshipContextForViewer } from '@/lib/friendship/viewer-context'
import { loadFriendshipMatchRecommendations } from '@/lib/friendship/load-matches'
import { resolveFriendshipMatchesView } from '@/lib/friendship/matching-flag'
import { buttonSecondaryClassName } from '@/lib/event-labels'

export default async function MatchedFriendsPage() {
  const viewer = await getViewer()

  if (!viewer) {
    redirect('/login')
  }

  if (!viewer.canAccessApp) {
    redirect('/application')
  }

  const { entitlements } = await loadMemberEntitlementsForViewer()
  const supabase = await createClient()
  const questionnaire = await loadOwnFriendshipQuestionnaire(supabase, viewer.userId)
  const { access } = friendshipContextForViewer(viewer, entitlements, questionnaire)
  const view = resolveFriendshipMatchesView({
    canViewMatches: access.canViewMatches,
  })

  if (view.kind === 'redirect') {
    redirect(view.href)
  }

  const shouldLoad = view.loadRecommendations
  const loaded = shouldLoad
    ? await loadFriendshipMatchRecommendations(supabase, viewer.userId)
    : { items: [], error: null }

  return (
    <>
      <PageHeader
        eyebrow="Friends"
        title="Matched Friends"
        description="Private friendship-fit recommendations based on your Friendship Questionnaire. Scores stay internal — you’ll see a fit label and shared reasons, never a percentage."
        actions={
          <Link
            href="/friendship"
            className="text-sm font-medium text-accent underline"
          >
            Questionnaire
          </Link>
        }
      />

      {view.kind === 'unavailable' ? (
        <Card>
          <h2 className="text-display text-lg font-semibold">{view.title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{view.description}</p>
        </Card>
      ) : null}

      {view.kind === 'inbox' ? (
        <>
          {loaded.error ? (
            <p className="mb-4 text-sm text-danger">{loaded.error}</p>
          ) : null}
          {loaded.items.length === 0 ? (
            <EmptyState
              title="No friend recommendations yet"
              description="When other paid members with Friends intent complete the questionnaire, strong fits will show up here."
              action={
                <Link href="/friendship" className={buttonSecondaryClassName}>
                  Review questionnaire
                </Link>
              }
            />
          ) : (
            <FriendshipMatchesList items={loaded.items} />
          )}
        </>
      ) : null}
    </>
  )
}
