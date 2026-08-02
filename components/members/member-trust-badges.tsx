import Badge from '@/components/ui/badge'
import type { TrustBadge } from '@/lib/members-discovery'

export default function MemberTrustBadges({ badges }: { badges: TrustBadge[] }) {
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Membership badges">
      {badges.map((badge) => (
        <Badge key={badge.label} variant={badge.variant}>
          {badge.label}
        </Badge>
      ))}
    </div>
  )
}
