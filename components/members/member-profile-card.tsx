import Link from 'next/link'
import Badge from '@/components/ui/badge'
import Card from '@/components/ui/card'
import { roleLabel } from '@/lib/event-labels'
import {
  intentLabel,
  memberDisplayName,
  memberSinceLabel,
  membershipBadgeLabel,
  professionalContext,
  type DirectoryMember,
} from '@/lib/members-discovery'
import { memberPublicIntentLabel } from '@/lib/member-public-intent'
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
  limited = false,
  href,
  compact = false,
}: MemberProfileCardProps) {
  const displayName = memberDisplayName(member)
  const context = professionalContext(member.role, limited)
  const since = memberSinceLabel(member.created_at)
  const showIntent = !limited || isCurrentUser
  const intent = intentLabel(member.membership_intent, {
    placeholder: isCurrentUser
      ? 'Add your about note in the form below'
      : 'Intent shared at events',
  })

  const primaryPhoto = primaryMemberPhoto(member.photos)

  const card = (
    <Card
      className={`transition ${href ? 'hover:border-accent/25 hover:shadow-md' : ''}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
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
            <p className="eyebrow mt-1">Your account</p>
          ) : null}
          {member.contactEmail ? (
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {member.contactEmail}
            </p>
          ) : null}
        </div>
        <Badge variant="accent">{roleLabel(member.role)}</Badge>
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <p className="eyebrow">Trust</p>
        <div className="mt-2">
          <MemberCardBadges member={member} />
        </div>
      </div>

      {compact && (member.location_area || member.public_intents.length > 0) ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {member.location_area ?? ''}
          {member.public_intents.length > 0
            ? `${member.location_area ? ' · ' : ''}${member.public_intents.map(memberPublicIntentLabel).join(', ')}`
            : ''}
        </p>
      ) : null}

      {!compact ? (
        <>
          <div className="mt-4">
            <p className="eyebrow">Intent</p>
            <p className="mt-2 text-sm leading-relaxed text-foreground">
              {showIntent ? intent : 'Connect at club events to learn more.'}
            </p>
          </div>

          <div className="mt-4">
            <p className="eyebrow">Context</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {context}
            </p>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{membershipBadgeLabel(member)}</span>
            {since ? (
              <>
                <span aria-hidden>·</span>
                <span>{since}</span>
              </>
            ) : null}
          </div>
        </>
      ) : null}

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
