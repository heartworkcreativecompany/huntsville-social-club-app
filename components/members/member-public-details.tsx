import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import { CONNECTION_TYPES_OPEN_TO_FIELD } from '@/lib/member-public-intent'
import type { ApplicationPublicProfileDetails } from '@/lib/application-profile-preview'

export default function MemberPublicDetails({
  details,
  compact = false,
}: {
  details: ApplicationPublicProfileDetails
  compact?: boolean
}) {
  const hasContent =
    details.connectionIntents.length > 0 ||
    details.locationArea ||
    details.occupation ||
    details.interests.length > 0 ||
    details.connectionsOpenTo.length > 0 ||
    details.lifestyleTags.length > 0 ||
    details.eventInterests.length > 0 ||
    details.socialVibe ||
    details.about ||
    details.prompts.length > 0

  if (!hasContent) return null

  const dl = (
    <dl className="grid gap-3 text-sm">
      {details.connectionIntents.length > 0 ? (
        <div>
          <dt className="text-muted-foreground">Looking for</dt>
          <dd className="mt-1 flex flex-wrap gap-1.5">
            {details.connectionIntents.map((intent) => (
              <Badge key={intent} variant="category">
                {intent}
              </Badge>
            ))}
          </dd>
        </div>
      ) : null}
      {details.locationArea ? (
        <div>
          <dt className="text-muted-foreground">Area</dt>
          <dd className="font-medium text-foreground">{details.locationArea}</dd>
        </div>
      ) : null}
      {details.about ? (
        <div>
          <dt className="text-muted-foreground">About</dt>
          <dd className="leading-relaxed text-foreground">{details.about}</dd>
        </div>
      ) : null}
      {details.connectionsOpenTo.length > 0 ? (
        <div>
          <dt className="text-muted-foreground">
            {CONNECTION_TYPES_OPEN_TO_FIELD.label}
          </dt>
          <dd className="font-medium text-foreground">
            {details.connectionsOpenTo.join(', ')}
          </dd>
        </div>
      ) : null}
      {details.occupation ? (
        <div>
          <dt className="text-muted-foreground">Work</dt>
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
      {details.socialVibe ? (
        <div>
          <dt className="text-muted-foreground">Event vibe</dt>
          <dd className="font-medium text-foreground">{details.socialVibe}</dd>
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
      {details.prompts.map((prompt) => (
        <div key={prompt.label}>
          <dt className="text-muted-foreground">{prompt.label}</dt>
          <dd className="leading-relaxed text-foreground">{prompt.value}</dd>
        </div>
      ))}
    </dl>
  )

  if (compact) {
    return <div className="border-t border-border pt-4">{dl}</div>
  }

  return (
    <Card padding="sm">
      <h3 className="text-display text-base font-medium text-foreground">
        Profile
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        What other approved members see in discovery.
      </p>
      <div className="mt-4">{dl}</div>
    </Card>
  )
}
