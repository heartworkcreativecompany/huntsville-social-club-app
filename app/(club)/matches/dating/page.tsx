import Link from 'next/link'
import { redirect } from 'next/navigation'
import CuratedMatchesInboxStatus from '@/components/matches/curated-matches-inbox-status'
import CuratedMatchesList from '@/components/matches/curated-matches-list'
import HowCompatibilityWorksInlineSummary from '@/components/compatibility/how-compatibility-works-summary'
import Card from '@/components/ui/card'
import PageHeader from '@/components/ui/page-header'
import { isCompatibilityFeatureEnabled } from '@/lib/compatibility/eligibility'
import { healStaleSubscriptionInactivePause } from '@/lib/compatibility/heal-stale-subscription-pause'
import { summarizeMemberMatchAvailability } from '@/lib/compatibility/member-match-availability'
import { isDevRecommendationSeedAllowed } from '@/lib/compatibility/seed-dev-recommendations'
import { compatibilityContextForViewer } from '@/lib/compatibility/viewer-context'
import { syncRecommendationLifecycleForMember } from '@/lib/curated-recommendation-lifecycle'
import { loadMemberDeliverySnapshot } from '@/lib/load-member-delivery-snapshot'
import {
  loadCuratedMatchRecommendations,
  sortCuratedMatchItems,
} from '@/lib/load-curated-matches'
import { loadMemberEntitlementsForViewer } from '@/lib/load-member-entitlements'
import { shouldHideCuratedMatchingSurfaces } from '@/lib/membership-entitlements'
import { isMessagingSuspended } from '@/lib/messaging-suspension'
import { createClient } from '@/lib/supabase/server'
import { getViewer } from '@/lib/viewer'

function MatchesBlockedState({
  headline,
  detail,
  ctaHref,
  ctaLabel,
}: {
  headline: string
  detail: string
  ctaHref: string | null
  ctaLabel: string | null
}) {
  return (
    <Card className="mb-6">
      <h2 className="text-display text-lg font-semibold">{headline}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
      {ctaHref && ctaLabel ? (
        <Link
          href={ctaHref}
          className="mt-4 inline-flex text-sm font-medium text-accent underline"
        >
          {ctaLabel}
        </Link>
      ) : null}
    </Card>
  )
}

export default async function DatingMatchesPage() {
  const viewer = await getViewer()

  if (!viewer) {
    redirect('/login')
  }

  if (!viewer.canAccessApp) {
    redirect('/application')
  }

  const { entitlements } = await loadMemberEntitlementsForViewer()
  const healed = await healStaleSubscriptionInactivePause(viewer, entitlements)
  const gatedViewer = healed ? (await getViewer()) ?? viewer : viewer
  const context = compatibilityContextForViewer(gatedViewer, entitlements)

  if (shouldHideCuratedMatchingSurfaces(entitlements)) {
    redirect('/dashboard')
  }

  if (!isCompatibilityFeatureEnabled()) {
    return (
      <>
        <PageHeader
          eyebrow="Dating"
          title="Dating Matches"
          description="Private compatibility recommendations for members open to dating connections."
          actions={
            <Link
              href="/compatibility/how-it-works"
              className="text-sm font-medium text-accent underline"
            >
              How it works
            </Link>
          }
        />
        <Card>
          <p className="text-sm text-muted-foreground">
            Curated Matches are not available right now.
          </p>
        </Card>
      </>
    )
  }

  if (!context.canAccessMatchesInbox) {
    return (
      <>
        <PageHeader
          eyebrow="Dating"
          title="Dating Matches"
          description="Private compatibility recommendations for members open to dating connections."
          actions={
            <Link
              href="/compatibility/how-it-works"
              className="text-sm font-medium text-accent underline"
            >
              How it works
            </Link>
          }
        />
        <MatchesBlockedState
          headline={context.summary.headline}
          detail={context.summary.detail}
          ctaHref={context.summary.ctaHref}
          ctaLabel={context.summary.ctaLabel}
        />
      </>
    )
  }

  const supabase = await createClient()
  await syncRecommendationLifecycleForMember(supabase, gatedViewer.userId)
  const { items, error } = await loadCuratedMatchRecommendations(
    supabase,
    gatedViewer.userId,
    { viewerInterests: gatedViewer.profile?.discovery_interests ?? null }
  )
  const sortedItems = sortCuratedMatchItems(items)
  const deliverySnapshot = await loadMemberDeliverySnapshot(supabase, gatedViewer.userId, {
    lastMatchGenerationAt: gatedViewer.profile?.last_match_generation_at ?? null,
    lastMatchReviewAt: gatedViewer.profile?.last_match_review_at ?? null,
  })
  const inboxCounts = {
    active: deliverySnapshot.activeRecommendationCount,
    archived: deliverySnapshot.archivedRecommendationCount,
  }
  const availability = summarizeMemberMatchAvailability({
    lastMatchGenerationAt: deliverySnapshot.lastMatchGenerationAt,
    lastMatchReviewAt: deliverySnapshot.lastMatchReviewAt,
    compatibilityCompletedAt: gatedViewer.profile?.compatibility_completed_at ?? null,
    latestBatch: deliverySnapshot.latestBatch,
    activeRecommendationCount: inboxCounts.active,
    archivedRecommendationCount: inboxCounts.archived,
    messagingSuspended: isMessagingSuspended(gatedViewer.profile),
  })

  return (
    <>
      <PageHeader
        eyebrow="Dating"
        title="Dating Matches"
        description="Staff-curated recommendations based on your private compatibility questionnaire. Request an intro when a match feels right — direct messaging opens after the intro is matched."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/compatibility/how-it-works"
              className="text-sm font-medium text-accent underline"
            >
              How it works
            </Link>
            <Link
              href="/compatibility"
              className="text-sm font-medium text-accent underline"
            >
              Questionnaire
            </Link>
          </div>
        }
      />

      {error ? (
        <p className="mb-4 text-sm text-danger">{error}</p>
      ) : null}

      <Card padding="sm" className="mb-6">
        <HowCompatibilityWorksInlineSummary />
      </Card>

      <CuratedMatchesInboxStatus availability={availability} />

      <CuratedMatchesList
        items={sortedItems}
        canMessage={context.canMessage}
        showDevSeed={isDevRecommendationSeedAllowed()}
        availability={availability}
      />
    </>
  )
}
