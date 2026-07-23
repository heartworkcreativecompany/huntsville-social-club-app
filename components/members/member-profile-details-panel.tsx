import Badge from '@/components/ui/badge'
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
import { MemberProfileBadges } from '@/components/members/member-badge-row'

export default function MemberProfileDetailsPanel({
  member,
  isCurrentUser = false,
  limited = true,
  title,
  previewMode = false,
}: {
  member: DirectoryMember
  isCurrentUser?: boolean
  limited?: boolean
  title?: string | null
  /** Application profile preview — hide account chrome and avoid repeating detail sections. */
  previewMode?: boolean
}) {
  const displayName = memberDisplayName(member)
  const context = professionalContext(member.role, limited)
  const since = memberSinceLabel(member.created_at)
  const showIntent = !limited || isCurrentUser || previewMode
  const intent = intentLabel(member.membership_intent, {
    placeholder: isCurrentUser
      ? 'Add your about note on your profile page'
      : 'Intent shared at events',
  })

  return (
    <div className="grid gap-4">
      <div>
        {title ? <p className="eyebrow">{title}</p> : null}
        <h2 className="text-display text-2xl font-semibold text-foreground sm:text-3xl">
          {displayName}
        </h2>
        {!previewMode && isCurrentUser ? (
          <p className="eyebrow mt-1">Your account</p>
        ) : null}
        {!previewMode ? (
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
        ) : null}
      </div>

      {!previewMode ? (
        <div>
          <p className="eyebrow">Trust</p>
          <div className="mt-2">
            <MemberProfileBadges member={member} />
          </div>
        </div>
      ) : null}

      {!previewMode &&
      (member.location_area || member.public_intents.length > 0) ? (
        <div>
          <p className="eyebrow">Locality & connections</p>
          <p className="mt-2 text-sm text-foreground">
            {member.location_area ?? 'Area not shared'}
            {member.public_intents.length > 0
              ? ` · ${member.public_intents.map(memberPublicIntentLabel).join(', ')}`
              : ''}
          </p>
        </div>
      ) : null}

      {!previewMode && member.discovery_interests.length > 0 ? (
        <div>
          <p className="eyebrow">Interests</p>
          <p className="mt-2 text-sm text-foreground">
            {member.discovery_interests.join(', ')}
          </p>
        </div>
      ) : null}

      {!previewMode ? (
        <div>
          <p className="eyebrow">About</p>
          <p className="mt-2 text-sm leading-relaxed text-foreground">
            {showIntent ? intent : 'Connect at club events to learn more.'}
          </p>
        </div>
      ) : null}

      {!previewMode ? (
        <div>
          <p className="eyebrow">Context</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {context}
          </p>
        </div>
      ) : null}

      {!previewMode && member.contactEmail ? (
        <div>
          <p className="eyebrow">Contact</p>
          <p className="mt-2 text-sm text-foreground">{member.contactEmail}</p>
        </div>
      ) : null}
    </div>
  )
}
