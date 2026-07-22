import Badge from '@/components/ui/badge'
import { EVENT_ACCESS_LABELS, type EventAccessType } from '@/lib/membership-tier-config'

/** @deprecated Prefer EventTypeBadge — kept for imports that expect this path. */
export default function EventAccessTypeBadge({
  eventType,
}: {
  eventType: EventAccessType | string | null | undefined
}) {
  const type = (
    eventType === 'circle_social'
      ? 'circle_social'
      : eventType === 'premium_event'
        ? 'premium_event'
        : 'standard_event'
  ) as EventAccessType
  const variant =
    type === 'circle_social' || type === 'premium_event' ? 'premium' : 'muted'

  return <Badge variant={variant}>{EVENT_ACCESS_LABELS[type]}</Badge>
}
