import Badge from '@/components/ui/badge'
import { hasUserRsvp } from '@/lib/event-display'

export default function EventMetaBadges({
  isPast,
  isCancelled,
  currentUserStatus,
  spotsLabel,
}: {
  isPast: boolean
  isCancelled: boolean
  currentUserStatus: string | null
  spotsLabel?: string | null
}) {
  const badges: { key: string; label: string; variant: 'success' | 'warning' | 'muted' | 'danger' }[] =
    []

  if (hasUserRsvp(currentUserStatus)) {
    badges.push({ key: 'rsvpd', label: "RSVP'd", variant: 'success' })
  }

  if (spotsLabel === 'Sold out') {
    badges.push({ key: 'sold-out', label: 'Sold Out', variant: 'danger' })
  } else if (spotsLabel?.startsWith('Only ')) {
    badges.push({ key: 'few-spots', label: 'Few Spots Left', variant: 'warning' })
  }

  if (isCancelled) {
    badges.push({ key: 'cancelled', label: 'Cancelled', variant: 'muted' })
  } else if (isPast) {
    badges.push({ key: 'past', label: 'Past', variant: 'muted' })
  }

  if (badges.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2">
      {badges.map((badge) => (
        <Badge key={badge.key} variant={badge.variant}>
          {badge.label}
        </Badge>
      ))}
    </div>
  )
}
