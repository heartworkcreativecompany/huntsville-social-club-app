import Link from 'next/link'
import Badge from '@/components/ui/badge'
import Card from '@/components/ui/card'
import MemberPhotoDisplay from '@/components/members/member-photo-display'
import { buttonSecondaryClassName } from '@/lib/event-labels'
import type { FriendshipMatchListItem } from '@/lib/friendship/load-matches'

function FitBadge({ label }: { label: string }) {
  const variant =
    label === 'Strong friendship fit'
      ? 'success'
      : label === 'Promising connection'
        ? 'accent'
        : 'category'

  return <Badge variant={variant}>{label}</Badge>
}

function MatchCard({ item }: { item: FriendshipMatchListItem }) {
  return (
    <Card padding="sm">
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
              <p className="text-display text-lg font-semibold">{item.displayName}</p>
              {item.locationArea ? (
                <p className="mt-1 text-sm text-muted-foreground">{item.locationArea}</p>
              ) : null}
              {item.matchReasons.length > 0 ? (
                <div className="mt-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Why this connection
                  </p>
                  <ul className="mt-1.5 list-disc space-y-1 pl-4">
                    {item.matchReasons.map((reason) => (
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
              <p className="mt-2 text-xs text-muted">
                Recommended{' '}
                {new Date(item.createdAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
            </div>
            <FitBadge label={item.fitLabel} />
          </div>

          <div className="mt-4 flex flex-wrap items-start gap-3">
            <Link
              href={`/members/${item.recommendedUserId}`}
              className={buttonSecondaryClassName}
            >
              View full profile
            </Link>
          </div>
        </div>
      </div>
    </Card>
  )
}

export default function FriendshipMatchesList({
  items,
}: {
  items: FriendshipMatchListItem[]
}) {
  return (
    <ul className="grid gap-4">
      {items.map((item) => (
        <li key={item.id}>
          <MatchCard item={item} />
        </li>
      ))}
    </ul>
  )
}
