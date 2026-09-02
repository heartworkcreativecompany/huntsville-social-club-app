import Link from 'next/link'
import Card from '@/components/ui/card'
import MemberPhotoDisplay from '@/components/members/member-photo-display'
import { buttonSecondaryClassName } from '@/lib/event-labels'
import type { ApplicationPhoto } from '@/lib/application'
import { isActiveRecommendationStatus } from '@/lib/compatibility/recommendation-lifecycle-config'
import {
  sortCuratedMatchItems,
  type CuratedMatchListItem,
} from '@/lib/load-curated-matches'
import type { FriendshipMatchListItem } from '@/lib/friendship/load-matches'

export const DASHBOARD_MATCH_PREVIEW_LIMIT = 3
export const DASHBOARD_DATING_MATCHES_HREF = '/matches'
export const DASHBOARD_FRIEND_MATCHES_HREF = '/friendship/matches'

export type DashboardMatchPreview = {
  id: string
  name: string
  photo: ApplicationPhoto | null
  memberId: string
  fitSummary: string | null
}

export function selectDatingMatchPreviews(
  items: CuratedMatchListItem[],
  limit = DASHBOARD_MATCH_PREVIEW_LIMIT
): DashboardMatchPreview[] {
  return sortCuratedMatchItems(items)
    .filter((item) => isActiveRecommendationStatus(item.status))
    .slice(0, limit)
    .map((item) => ({
      id: item.id,
      name: item.displayName,
      photo: item.primaryPhoto,
      memberId: item.recommendedUserId,
      fitSummary: item.matchExplanations[0] ?? null,
    }))
}

export function selectFriendshipMatchPreviews(
  items: FriendshipMatchListItem[],
  limit = DASHBOARD_MATCH_PREVIEW_LIMIT
): DashboardMatchPreview[] {
  return items.slice(0, limit).map((item) => ({
    id: item.id,
    name: item.displayName,
    photo: item.primaryPhoto,
    memberId: item.recommendedUserId,
    fitSummary: item.fitLabel || null,
  }))
}

function MatchPreviewCard({
  item,
  href,
}: {
  item: DashboardMatchPreview
  href: string
}) {
  return (
    <Link href={href} className="block no-underline">
      <Card
        padding="sm"
        className="transition hover:border-accent/25 hover:bg-surface-elevated/40"
      >
        <div className="flex items-center gap-3">
          <MemberPhotoDisplay
            memberId={item.memberId}
            photo={item.photo}
            size="compact"
          />
          <div className="min-w-0">
            <p className="font-brand text-sm font-semibold text-foreground">
              {item.name}
            </p>
            {item.fitSummary ? (
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                {item.fitSummary}
              </p>
            ) : null}
          </div>
        </div>
      </Card>
    </Link>
  )
}

function MatchPreviewGroup({
  title,
  href,
  items,
}: {
  title: string
  href: string
  items: DashboardMatchPreview[]
}) {
  if (items.length === 0) {
    return null
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <h3 className="text-display text-lg font-semibold">{title}</h3>
        <Link href={href} className={buttonSecondaryClassName}>
          View matches
        </Link>
      </div>
      <ul className="grid gap-3">
        {items.map((item) => (
          <li key={item.id}>
            <MatchPreviewCard item={item} href={href} />
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function RecentMatchesPreview({
  dating,
  friends,
}: {
  dating: DashboardMatchPreview[]
  friends: DashboardMatchPreview[]
}) {
  if (dating.length === 0 && friends.length === 0) {
    return null
  }

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-display text-xl font-semibold">Recent matches</h2>
      </div>
      <div className="grid gap-8">
        <MatchPreviewGroup
          title="Dating Matches"
          href={DASHBOARD_DATING_MATCHES_HREF}
          items={dating}
        />
        <MatchPreviewGroup
          title="Matched Friends"
          href={DASHBOARD_FRIEND_MATCHES_HREF}
          items={friends}
        />
      </div>
    </section>
  )
}
