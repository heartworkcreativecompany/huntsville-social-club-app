import Link from 'next/link'
import Badge from '@/components/ui/badge'
import Card from '@/components/ui/card'
import type { FriendshipAccessStatus } from '@/lib/friendship/types'

function statusBadgeVariant(
  status: FriendshipAccessStatus
): 'success' | 'warning' | 'muted' | 'accent' {
  switch (status) {
    case 'active':
      return 'success'
    case 'questionnaire_needed':
    case 'questionnaire_in_progress':
      return 'accent'
    case 'matching_unavailable':
      return 'muted'
    case 'no_messaging':
    case 'no_friends':
      return 'warning'
    default:
      return 'muted'
  }
}

export default function FriendshipStatusModule({
  headline,
  detail,
  status,
  ctaHref,
  ctaLabel,
}: {
  headline: string
  detail: string
  status: FriendshipAccessStatus
  ctaHref: string | null
  ctaLabel: string | null
}) {
  return (
    <Card padding="sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Friendship compatibility</p>
          <h2 className="text-display mt-1 text-lg font-semibold">{headline}</h2>
        </div>
        <Badge variant={statusBadgeVariant(status)}>
          {status === 'active'
            ? 'Active'
            : status === 'questionnaire_in_progress'
              ? 'In progress'
              : status === 'questionnaire_needed'
                ? 'Action needed'
              : status === 'matching_unavailable'
                ? 'Preparing'
                : status === 'no_messaging'
                  ? 'Paid members'
                  : 'Info'}
        </Badge>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{detail}</p>
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
