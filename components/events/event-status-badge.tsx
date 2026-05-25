import Badge from '@/components/ui/badge'
import { eventStatusLabel } from '@/lib/event-labels'

export default function EventStatusBadge({
  status,
}: {
  status: string | null | undefined
}) {
  const value = status ?? 'published'
  const variant =
    value === 'published'
      ? 'success'
      : value === 'draft'
        ? 'warning'
        : 'muted'

  return <Badge variant={variant}>{eventStatusLabel(value)}</Badge>
}
