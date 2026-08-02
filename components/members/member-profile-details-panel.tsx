import Badge from '@/components/ui/badge'
import {
  memberDisplayName,
  memberSinceLabel,
  type DirectoryMember,
} from '@/lib/members-discovery'
import {
  memberPublicIntentBadgeVariant,
  memberPublicIntentLabel,
} from '@/lib/member-public-intent'
import { MemberProfileBadges } from '@/components/members/member-badge-row'

/**
 * Header for member profiles: name, membership tier, intent badges, area.
 * Public field sections live in MemberPublicDetails to avoid duplicates.
 */
export default function MemberProfileDetailsPanel({
  member,
  isCurrentUser = false,
  title,
  previewMode = false,
}: {
  member: DirectoryMember
  isCurrentUser?: boolean
  limited?: boolean
  title?: string | null
  /** Application profile preview — hide account chrome. */
  previewMode?: boolean
}) {
  const displayName = memberDisplayName(member)
  const since = memberSinceLabel(member.created_at)

  return (
    <div className="grid gap-4">
      <div>
        {title ? <p className="eyebrow">{title}</p> : null}
        <h2 className="text-display text-2xl font-semibold text-foreground sm:text-3xl">
          {displayName}
        </h2>
        {!previewMode && isCurrentUser ? (
          <p className="eyebrow mt-1">Your profile</p>
        ) : null}

        <div className="mt-3">
          <MemberProfileBadges member={member} />
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

        {member.location_area ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {member.location_area}
          </p>
        ) : null}

        {!previewMode && since ? (
          <p className="mt-1 text-xs text-muted-foreground">Member since {since}</p>
        ) : null}

        {!previewMode && member.contactEmail ? (
          <p className="mt-3 text-sm text-foreground">{member.contactEmail}</p>
        ) : null}
      </div>
    </div>
  )
}
