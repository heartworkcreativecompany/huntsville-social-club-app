import Card from '@/components/ui/card'
import type { MemberMatchAvailabilitySummary } from '@/lib/compatibility/member-match-availability'

export default function CuratedMatchesInboxStatus({
  availability,
}: {
  availability: MemberMatchAvailabilitySummary
}) {
  if (availability.deliveryLines.length === 0) {
    return null
  }

  return (
    <Card padding="sm" className="mb-6">
      <p className="text-sm font-medium text-foreground">{availability.headline}</p>
      <p className="mt-2 text-sm text-muted-foreground">{availability.detail}</p>
      <ul className="mt-3 space-y-1 text-xs text-muted">
        {availability.deliveryLines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </Card>
  )
}
