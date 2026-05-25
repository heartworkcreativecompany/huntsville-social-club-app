import Badge from '@/components/ui/badge'
import { tierLabel, type EventTier } from '@/lib/event-eligibility'

const tierVariant: Record<
  EventTier,
  'default' | 'accent' | 'warning' | 'muted'
> = {
  standard: 'default',
  members: 'default',
  hosts: 'accent',
  invite: 'warning',
}

export default function EventTierBadge({ tier }: { tier: EventTier }) {
  return (
    <Badge variant={tierVariant[tier]}>{tierLabel(tier)}</Badge>
  )
}
