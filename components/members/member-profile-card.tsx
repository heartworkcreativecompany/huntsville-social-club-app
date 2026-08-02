import Link from 'next/link'
import Badge from '@/components/ui/badge'
import Card from '@/components/ui/card'
import {
  memberDisplayName,
  type DirectoryMember,
} from '@/lib/members-discovery'
import {
  memberPublicIntentBadgeVariant,
  memberPublicIntentLabel,
} from '@/lib/member-public-intent'
import { MemberCardBadges } from '@/components/members/member-badge-row'
import { primaryMemberPhoto } from '@/lib/member-photos'
import MemberPhotoDisplay from './member-photo-display'

type MemberProfileCardProps = {
  member: DirectoryMember
  isCurrentUser?: boolean
  limited?: boolean
  href?: string | null
  compact?: boolean
}

export default function MemberProfileCard({
  member,
  isCurrentUser,
  href,
  compact = false,
}: MemberProfileCardProps) {
  const displayName = memberDisplayName(member)
  const primaryPhoto = primaryMemberPhoto(member.photos)
  const about = member.membership_intent?.trim() || null

  const card = (
    <Card
      className={`transition ${href ? 'hover:border-accent/25 hover:shadow-md' : ''}`}
    >
      <div className="flex flex-wrap items-start gap-3">
        {primaryPhoto ? (
          <MemberPhotoDisplay
            memberId={member.id}
            photo={primaryPhoto}
            size={compact ? 'compact' : 'thumbnail'}
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-display text-xl font-semibold text-foreground">
            {displayName}
          </p>
          {isCurrentUser ? (
            <p className="eyebrow mt-1">Your profile</p>
          ) : null}
          {member.location_area ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {member.location_area}
            </p>
          ) : null}
          <div className="mt-3">
            <MemberCardBadges member={member} />
          </div>
          {member.public_intents.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {member.public_intents.map((intent) => (
                <Badge key={intent} variant={memberPublicIntentBadgeVariant()}>
                  {memberPublicIntentLabel(intent)}
                </Badge>
              ))}
            </div>
          ) : null}
          {!compact && about ? (
            <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
              {about}
            </p>
          ) : null}
        </div>
      </div>

      {href ? (
        <p className="mt-4 font-brand text-sm font-medium text-accent">
          View profile →
        </p>
      ) : null}
    </Card>
  )

  if (href) {
    return (
      <Link href={href} className="block no-underline text-inherit">
        {card}
      </Link>
    )
  }

  return card
}
