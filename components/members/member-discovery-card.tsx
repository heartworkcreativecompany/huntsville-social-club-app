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
import MemberPhotoDisplay from '@/components/members/member-photo-display'

/**
 * Directory preview card — navigates to the member profile.
 * Messaging lives on the profile page only (no composer here).
 */
export default function MemberDiscoveryCard({
  member,
}: {
  member: DirectoryMember
}) {
  const displayName = memberDisplayName(member)
  const primaryPhoto = primaryMemberPhoto(member.photos)
  const about = member.membership_intent?.trim() || null

  return (
    <Card className="flex h-full flex-col transition hover:border-accent/25 hover:shadow-md">
      <Link
        href={`/members/${member.id}`}
        className="block flex-1 no-underline text-inherit"
      >
        <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-surface-elevated">
          {primaryPhoto ? (
            <MemberPhotoDisplay
              memberId={member.id}
              photo={primaryPhoto}
              size="thumb"
              className="!aspect-auto h-full min-h-0 w-full rounded-none border-0"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted">
              No photo yet
            </div>
          )}
        </div>

        <div className="mt-4">
          <p className="text-display text-lg font-semibold">{displayName}</p>
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
          {about ? (
            <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
              {about}
            </p>
          ) : null}
          <p className="mt-4 font-brand text-sm font-medium text-accent">
            View profile →
          </p>
        </div>
      </Link>
    </Card>
  )
}
