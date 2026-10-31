import DirectoryProfileLink from '@/components/members/directory-profile-link'
import Badge from '@/components/ui/badge'
import { memberProfileHref } from '@/lib/directory-return'
import type { DirectoryQueryState } from '@/lib/member-directory-query'
import {
  DEFAULT_DIRECTORY_BROWSE_STATE,
  memberDisplayName,
  type DirectoryMember,
} from '@/lib/members-discovery'
import {
  memberPublicIntentBadgeVariant,
  memberPublicIntentLabel,
} from '@/lib/member-public-intent'
import { MemberCardBadges } from '@/components/members/member-badge-row'
import {
  MEMBER_DIRECTORY_CARD_PHOTO_ASPECT_CLASS,
  primaryMemberPhoto,
} from '@/lib/member-photos'
import MemberPhotoDisplay from '@/components/members/member-photo-display'

const DEFAULT_DIRECTORY: DirectoryQueryState = {
  search: '',
  browse: DEFAULT_DIRECTORY_BROWSE_STATE,
  page: 1,
}

/**
 * Directory preview card. The whole card is the profile link.
 * Messaging lives on the profile page only (no composer here).
 */
export default function MemberDiscoveryCard({
  member,
  directory = DEFAULT_DIRECTORY,
  profileHref,
  photoSrc = null,
}: {
  member: DirectoryMember
  directory?: DirectoryQueryState
  profileHref?: string
  photoSrc?: string | null
}) {
  const displayName = memberDisplayName(member)
  const primaryPhoto = primaryMemberPhoto(member.photos)
  const about = member.membership_intent?.trim() || null
  const href = profileHref ?? memberProfileHref(member.id, directory)

  return (
    <DirectoryProfileLink
      href={href}
      memberId={member.id}
      className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-surface p-3 text-inherit no-underline shadow-sm transition hover:border-accent/25 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:p-5"
    >
      <div
        className={`relative w-full overflow-hidden rounded-lg bg-surface-elevated ${MEMBER_DIRECTORY_CARD_PHOTO_ASPECT_CLASS}`}
      >
        {photoSrc ? (
          // Review fixtures only. Live cards use the signed member photo.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoSrc}
            alt=""
            className="h-full w-full object-cover object-center"
          />
        ) : primaryPhoto ? (
          <MemberPhotoDisplay
            memberId={member.id}
            photo={primaryPhoto}
            size="thumb"
            allowRetry={false}
            imageClassName="object-center"
            className="!aspect-auto h-full min-h-0 w-full rounded-none border-0"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-2 text-center text-sm text-muted">
            No photo yet
          </div>
        )}
      </div>

      <div className="mt-3 min-w-0 md:mt-4">
        <p className="text-display line-clamp-2 break-words text-base leading-snug font-semibold md:text-lg">
          {displayName}
        </p>
        {member.location_area ? (
          <p className="mt-1 line-clamp-2 break-words text-sm text-muted-foreground">
            {member.location_area}
          </p>
        ) : null}
        <div className="mt-3 min-w-0 [&_span]:max-w-full [&_span]:break-words [&_span]:whitespace-normal">
          <MemberCardBadges member={member} />
        </div>
        {member.public_intents.length > 0 ? (
          <div className="mt-2 flex min-w-0 flex-wrap gap-1.5">
            {member.public_intents.map((intent) => (
              <Badge key={intent} variant={memberPublicIntentBadgeVariant()}>
                {memberPublicIntentLabel(intent)}
              </Badge>
            ))}
          </div>
        ) : null}
        {about ? (
          <p className="mt-3 hidden line-clamp-2 text-sm leading-relaxed text-muted-foreground md:block">
            {about}
          </p>
        ) : null}
        <p className="mt-4 hidden font-brand text-sm font-medium text-accent md:block">
          View profile →
        </p>
      </div>
    </DirectoryProfileLink>
  )
}
