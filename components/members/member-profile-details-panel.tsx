import Badge from '@/components/ui/badge'
import { roleLabel } from '@/lib/event-labels'
import {
  discoveryIntentLabel,
  intentLabel,
  memberDisplayName,
  memberSinceLabel,
  membershipBadgeLabel,
  professionalContext,
  type DirectoryMember,
} from '@/lib/members-discovery'
import { MemberProfileBadges } from '@/components/members/member-badge-row'

export default function MemberProfileDetailsPanel({
  member,
  isCurrentUser = false,
  limited = true,
  title,
}: {
  member: DirectoryMember
  isCurrentUser?: boolean
  limited?: boolean
  title?: string | null
}) {
  const displayName = memberDisplayName(member)
  const context = professionalContext(member.role, limited)
  const since = memberSinceLabel(member.created_at)
  const showIntent = !limited || isCurrentUser
  const intent = intentLabel(member.membership_intent, {
    placeholder: isCurrentUser
      ? 'Add your intent in profile settings'
      : 'Intent shared at events',
  })

  return (
    <div className="grid gap-4">
      <div>
        {title ? (
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {title}
          </p>
        ) : null}
        <h2 className="text-display text-2xl font-medium text-foreground sm:text-3xl">
          {displayName}
        </h2>
        {isCurrentUser ? (
          <p className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Your account
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant="accent">{roleLabel(member.role)}</Badge>
          <span className="text-xs text-muted-foreground">
            {membershipBadgeLabel(member)}
          </span>
          {since ? (
            <>
              <span aria-hidden className="text-muted-foreground">
                ·
              </span>
              <span className="text-xs text-muted-foreground">{since}</span>
            </>
          ) : null}
        </div>
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Trust
        </p>
        <div className="mt-2">
          <MemberProfileBadges member={member} />
        </div>
      </div>

      {member.location_area || member.discovery_intent ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Locality & intent
          </p>
          <p className="mt-2 text-sm text-foreground">
            {member.location_area ?? 'Area not shared'}
            {member.discovery_intent
              ? ` · ${discoveryIntentLabel(member.discovery_intent)}`
              : ''}
          </p>
        </div>
      ) : null}

      {member.discovery_interests.length > 0 ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Interests
          </p>
          <p className="mt-2 text-sm text-foreground">
            {member.discovery_interests.join(', ')}
          </p>
        </div>
      ) : null}

      <div>
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          About
        </p>
        <p className="mt-2 text-sm leading-relaxed text-foreground">
          {showIntent ? intent : 'Connect at club events to learn more.'}
        </p>
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Context
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {context}
        </p>
      </div>

      {!limited && member.email ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Contact
          </p>
          <p className="mt-2 text-sm text-foreground">{member.email}</p>
        </div>
      ) : null}
    </div>
  )
}
