import MemberProfileCard from '@/components/members/member-profile-card'
import Card from '@/components/ui/card'
import type { DirectoryMember } from '@/lib/members-discovery'
import type { ApplicationPublicProfileDetails } from '@/lib/application-profile-preview'

export default function MemberProfilePresentation({
  member,
  isCurrentUser = false,
  limited = true,
  details,
  photoSlot,
  banner,
}: {
  member: DirectoryMember
  isCurrentUser?: boolean
  limited?: boolean
  details?: ApplicationPublicProfileDetails | null
  photoSlot?: React.ReactNode
  banner?: React.ReactNode
}) {
  return (
    <div className="grid gap-6">
      {banner ? (
        <div className="rounded-lg border border-accent/30 bg-accent-soft/40 px-4 py-3 text-sm text-muted-foreground">
          {banner}
        </div>
      ) : null}

      {photoSlot}

      <MemberProfileCard
        member={member}
        isCurrentUser={isCurrentUser}
        limited={limited}
      />

      {details ? (
        <Card padding="sm">
          <h3 className="text-display text-base font-medium text-foreground">
            Public profile details
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            What other approved members see in discovery—private fields like
            legal name and exact address are never shown here.
          </p>
          <dl className="mt-4 grid gap-3 text-sm">
            {details.locationArea ? (
              <div>
                <dt className="text-muted-foreground">Area</dt>
                <dd className="font-medium text-foreground">
                  {details.locationArea}
                </dd>
              </div>
            ) : null}
            {details.occupation ? (
              <div>
                <dt className="text-muted-foreground">Occupation</dt>
                <dd className="font-medium text-foreground">
                  {details.occupation}
                  {details.industry ? ` · ${details.industry}` : ''}
                </dd>
              </div>
            ) : null}
            {details.interests.length > 0 ? (
              <div>
                <dt className="text-muted-foreground">Interests</dt>
                <dd className="font-medium text-foreground">
                  {details.interests.join(', ')}
                </dd>
              </div>
            ) : null}
            {details.lifestyleTags.length > 0 ? (
              <div>
                <dt className="text-muted-foreground">Lifestyle</dt>
                <dd className="font-medium text-foreground">
                  {details.lifestyleTags.join(', ')}
                </dd>
              </div>
            ) : null}
            {details.eventInterests.length > 0 ? (
              <div>
                <dt className="text-muted-foreground">Event interests</dt>
                <dd className="font-medium text-foreground">
                  {details.eventInterests.join(', ')}
                </dd>
              </div>
            ) : null}
            {details.about ? (
              <div>
                <dt className="text-muted-foreground">About</dt>
                <dd className="leading-relaxed text-foreground">{details.about}</dd>
              </div>
            ) : null}
          </dl>
        </Card>
      ) : null}
    </div>
  )
}
