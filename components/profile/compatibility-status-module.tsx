import Link from 'next/link'
import Badge from '@/components/ui/badge'
import Card from '@/components/ui/card'
import HowCompatibilityWorksInlineSummary from '@/components/compatibility/how-compatibility-works-summary'
import type { CompatibilityProfileStatus } from '@/lib/compatibility/profile-status'

function statusBadgeVariant(
  status: CompatibilityProfileStatus
): 'success' | 'warning' | 'muted' | 'accent' {
  switch (status) {
    case 'active':
      return 'success'
    case 'questionnaire_needed':
    case 'questionnaire_in_progress':
      return 'accent'
    case 'no_messaging':
    case 'no_dating':
    case 'paused':
    case 'paused_system':
      return 'warning'
    default:
      return 'muted'
  }
}

export default function CompatibilityStatusModule({
  headline,
  detail,
  status,
  ctaHref,
  ctaLabel,
  deliveryLines,
  messagingSuspended = false,
}: {
  headline: string
  detail: string
  status: CompatibilityProfileStatus
  ctaHref: string | null
  ctaLabel: string | null
  deliveryLines?: string[]
  messagingSuspended?: boolean
}) {
  return (
    <Card padding="sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Curated matches</p>
          <h2 className="text-display mt-1 text-lg font-semibold">{headline}</h2>
        </div>
        <Badge variant={statusBadgeVariant(status)}>
          {messagingSuspended
            ? 'On hold'
            : status === 'active'
              ? 'Active'
              : status === 'questionnaire_in_progress'
                ? 'In progress'
                : status === 'questionnaire_needed'
                  ? 'Action needed'
                  : 'Info'}
        </Badge>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{detail}</p>
      {deliveryLines && deliveryLines.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs text-muted">
          {deliveryLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      <HowCompatibilityWorksInlineSummary className="mt-4 border-t border-border pt-4" />
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
