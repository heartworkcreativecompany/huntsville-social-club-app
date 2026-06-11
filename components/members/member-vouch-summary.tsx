import Badge from '@/components/ui/badge'
import {
  VOUCH_DISCLAIMER,
  VOUCH_TYPE_OPTIONS,
  type VouchSummary,
} from '@/lib/member-vouches'

export default function MemberVouchSummary({
  summary,
  compact = false,
}: {
  summary: VouchSummary
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
      <p className="text-xs leading-relaxed text-muted-foreground">
        {VOUCH_DISCLAIMER}
      </p>
    </div>
  )
}
