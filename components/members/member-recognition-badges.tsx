import Badge from '@/components/ui/badge'
import type { PublicRecognitionBadge } from '@/lib/recognition-badges/catalog'

export default function MemberRecognitionBadges({
  badges,
}: {
  badges?: PublicRecognitionBadge[] | null
}) {
  if (!badges?.length) return null

  return (
    <div className="flex max-w-full flex-wrap gap-1.5" aria-label="Recognition badges">
      {badges.map((badge) => (
        <Badge key={badge.slug} variant="premium_outline">
          {badge.publicLabel}
        </Badge>
      ))}
    </div>
  )
}
