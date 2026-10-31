import Badge from '@/components/ui/badge'
import {
  VOUCH_DISCLAIMER,
  VOUCH_TYPE_OPTIONS,
  vouchTypeLabel,
  type PublicVouchEndorsement,
  type VouchSummary,
} from '@/lib/member-vouches'

export default function MemberVouchSummary({
  summary,
  endorsements = [],
  compact = false,
}: {
  summary: VouchSummary
  endorsements?: PublicVouchEndorsement[]
  compact?: boolean
}) {
  if (summary.total === 0) return null

  const items = VOUCH_TYPE_OPTIONS.filter(
    (option) => summary[option.value] > 0
  ).map((option) => ({
    key: option.value,
    label: option.summaryLabel,
    count: summary[option.value],
  }))

  if (compact) {
    return (
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <Badge key={item.key} variant="premium">
            {item.label} ({item.count})
          </Badge>
        ))}
      </div>
    )
  }

  return (
    <div className="grid gap-2">
      <p className="eyebrow">Member vouches</p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <Badge key={item.key} variant="premium">
            {item.label} ({item.count})
          </Badge>
        ))}
      </div>
      {endorsements.length > 0 ? (
        <ul className="mt-2 grid gap-3">
          {endorsements.map((endorsement) => (
            <li key={endorsement.id} className="text-sm">
              <p className="font-medium text-foreground">
                {endorsement.authorName}
                <span className="font-normal text-muted-foreground">
                  {' '}
                  · {vouchTypeLabel(endorsement.vouchType)}
                  {endorsement.approvedAt
                    ? ` · ${new Date(endorsement.approvedAt).toLocaleDateString()}`
                    : ''}
                </span>
              </p>
              {endorsement.endorsement ? (
                <p className="mt-1 leading-relaxed text-muted-foreground">
                  {endorsement.endorsement}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs leading-relaxed text-muted-foreground">
        {VOUCH_DISCLAIMER}
      </p>
    </div>
  )
}
