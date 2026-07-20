import Link from 'next/link'
import Badge from '@/components/ui/badge'
import Card from '@/components/ui/card'
import EmptyState from '@/components/ui/empty-state'
import CuratedMatchIntroButton from '@/components/matches/curated-match-intro-button'
import CuratedMatchPassButton from '@/components/matches/curated-match-pass-button'
import DevSeedMatchesButton from '@/components/matches/dev-seed-matches-button'
import MemberPhotoDisplay from '@/components/members/member-photo-display'
import {
  curatedMatchDisplayBadgeVariant,
  curatedMatchDisplayDetail,
  curatedMatchDisplayLabel,
  curatedMatchDisplayState,
  isArchivedMatchDisplayState,
} from '@/lib/curated-match-lifecycle'
import type { MemberMatchAvailabilitySummary } from '@/lib/compatibility/member-match-availability'
import { buttonSecondaryClassName } from '@/lib/event-labels'
import type { CuratedMatchListItem } from '@/lib/load-curated-matches'

function MatchCard({
  item,
  canMessage,
}: {
  item: CuratedMatchListItem
  canMessage: boolean
}) {
  const displayState = curatedMatchDisplayState({
    introStatus: item.introStatus,
    recommendationStatus: item.status,
  })
  const detail = curatedMatchDisplayDetail(displayState)
  const archived = isArchivedMatchDisplayState(displayState)

  return (
    <Card padding="sm" className={archived ? 'opacity-80' : undefined}>
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative h-36 w-full shrink-0 overflow-hidden rounded-lg bg-surface-elevated sm:h-32 sm:w-28">
          <MemberPhotoDisplay
            memberId={item.recommendedUserId}
            photo={item.primaryPhoto}
            size="thumb"
            className="!aspect-auto h-full min-h-0 w-full rounded-none border-0"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-display text-lg font-semibold">
                {item.displayName}
              </p>
              {item.locationArea ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {item.locationArea}
                </p>
              ) : null}
              <p className="mt-2 text-sm text-muted-foreground">
                {Math.round(item.compatibilityScore)}% compatibility
              </p>
              {!archived && item.matchExplanations.length > 0 ? (
                <div className="mt-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Why this match
                  </p>
                  <ul className="mt-1.5 list-disc space-y-1 pl-4">
                    {item.matchExplanations.map((reason) => (
                      <li
                        key={reason}
                        className="text-sm leading-relaxed text-muted-foreground"
                      >
                        {reason}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {item.membershipIntent ? (
                <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                  {item.membershipIntent}
                </p>
              ) : null}
              <p className="mt-2 text-xs text-muted">
                Recommended{' '}
                {new Date(item.createdAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
                {item.expiresAt && !archived ? (
                  <span>
                    {' '}
                    · Expires{' '}
                    {new Date(item.expiresAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                ) : null}
              </p>
            </div>
            <Badge variant={curatedMatchDisplayBadgeVariant(displayState)}>
              {curatedMatchDisplayLabel(displayState)}
            </Badge>
          </div>

          <p className="mt-3 text-sm text-muted-foreground">{detail}</p>

          <div className="mt-4 flex flex-wrap items-start gap-3">
            <Link
              href={`/members/${item.recommendedUserId}`}
              className={buttonSecondaryClassName}
            >
              View full profile
            </Link>
            <CuratedMatchIntroButton
              recommendationId={item.id}
              introStatus={item.introStatus}
              recommendationStatus={item.status}
              conversationId={item.conversationId}
              canMessage={canMessage}
              displayState={displayState}
            />
            <CuratedMatchPassButton
              recommendationId={item.id}
              displayState={displayState}
            />
          </div>
        </div>
      </div>
    </Card>
  )
}

export default function CuratedMatchesList({
  items,
  canMessage,
  showDevSeed,
  availability,
}: {
  items: CuratedMatchListItem[]
  canMessage: boolean
  showDevSeed: boolean
  availability: MemberMatchAvailabilitySummary
}) {
  if (items.length === 0) {
    return (
      <div className="space-y-4">
        <EmptyState
          title={availability.emptyTitle}
          description={availability.emptyDescription}
          action={
            <Link href="/compatibility" className={buttonSecondaryClassName}>
              Review questionnaire
            </Link>
          }
        />
        {showDevSeed ? <DevSeedMatchesButton /> : null}
      </div>
    )
  }

  const activeItems = items.filter(
    (item) =>
      !isArchivedMatchDisplayState(
        curatedMatchDisplayState({
          introStatus: item.introStatus,
          recommendationStatus: item.status,
        })
      )
  )
  const archivedItems = items.filter((item) =>
    isArchivedMatchDisplayState(
      curatedMatchDisplayState({
        introStatus: item.introStatus,
        recommendationStatus: item.status,
      })
    )
  )

  return (
    <div className="space-y-8">
      {activeItems.length > 0 ? (
        <section>
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Active recommendations
          </h2>
          <ul className="mt-3 grid gap-4">
            {activeItems.map((item) => (
              <li key={item.id}>
                <MatchCard item={item} canMessage={canMessage} />
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <EmptyState
          title={availability.emptyTitle}
          description={availability.emptyDescription}
        />
      )}

      {archivedItems.length > 0 ? (
        <section>
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Archive
          </h2>
          <ul className="mt-3 grid gap-4">
            {archivedItems.map((item) => (
              <li key={item.id}>
                <MatchCard item={item} canMessage={canMessage} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
