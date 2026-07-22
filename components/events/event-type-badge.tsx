import Badge from '@/components/ui/badge'
import { eventTypeLabel } from '@/lib/event-display'

export default function EventTypeBadge({
  eventType,
}: {
  eventType: string | null | undefined
}) {
  const label = eventTypeLabel(eventType)
  const variant =
    eventType === 'circle_social' || eventType === 'premium_event'
      ? 'premium'
      : 'muted'

  return <Badge variant={variant}>{label}</Badge>
}
