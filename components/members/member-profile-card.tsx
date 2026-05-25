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
  trustBadges,
  type DirectoryMember,
} from '@/lib/members-discovery'
import MemberTrustBadges from './member-trust-badges'

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
  const badges = trustBadges(member)
  const context = professionalContext(member.role, limited)
  const since = memberSinceLabel(member.created_at)
  const showIntent = !limited || isCurrentUser
  const intent = intentLabel(member.membership_intent, {
    placeholder: isCurrentUser
      ? 'Add your intent in profile settings below'
      : 'Intent shared at events',
  })

  const card = (
    <Card
      className={`transition ${href ? 'hover:border-border-strong hover:shadow-md' : ''}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-display text-xl font-medium text-foreground">
            {displayName}
          </p>
          {isCurrentUser ? (
            <p className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Your account
            </p>
          ) : null}
          {!limited && member.email ? (
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {member.email}
            </p>
          ) : null}
        </div>
        <Badge variant="accent">{roleLabel(member.role)}</Badge>
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Trust
        </p>
        <div className="mt-2">
          <MemberTrustBadges badges={badges} />
        </div>
      </div>

      {!compact ? (
        <>
          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Intent
            </p>
            <p className="mt-2 text-sm leading-relaxed text-foreground">
              {showIntent ? intent : 'Connect at club events to learn more.'}
            </p>
          </div>

          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Context
            </p>
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
        <p className="mt-4 text-sm font-medium text-accent">View profile →</p>
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
