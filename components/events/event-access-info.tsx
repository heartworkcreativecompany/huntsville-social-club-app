import Link from 'next/link'
import Card from '@/components/ui/card'
import { buttonPrimaryClassName } from '@/lib/event-labels'
import type { MemberEntitlements } from '@/lib/membership-entitlements'
import type { EventRegistrationDecision } from '@/lib/membership-tier-config'
import type { EventAccessType } from '@/lib/membership-tier-config'
import { eventCardAccessHint } from '@/lib/event-display'
import { INNER_CIRCLE_FREE_REGISTRATIONS_PER_PERIOD } from '@/lib/membership-tier-config'

export default function EventAccessInfo({
  eventType,
  entitlements,
  registrationPreview,
  isPast,
  isCancelled,
}: {
  eventType: EventAccessType
  entitlements: MemberEntitlements | null
  registrationPreview: EventRegistrationDecision | null
  isPast: boolean
  isCancelled: boolean
}) {
  if (isPast || isCancelled) {
    return (
      <Card padding="sm" className="mb-8 border-border bg-surface-elevated/50">
        <p className="text-sm text-muted-foreground">
          {isCancelled
            ? 'This event has been cancelled.'
            : 'This event has already taken place.'}
        </p>
      </Card>
    )
  }

  const accessHint = eventCardAccessHint({
    registrationPreview,
    currentUserStatus: null,
    isPast,
    isCancelled,
  })

  const tier = entitlements?.productTier ?? 'member'

  return (
    <Card padding="sm" className="mb-8 border-accent/20 bg-accent-soft/20">
      <p className="eyebrow">Access</p>
      {accessHint ? (
        <p className="mt-2 text-sm font-medium text-foreground">{accessHint}</p>
      ) : null}

      <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
        {eventType === 'circle_social' ? (
          <li>Circle Socials are included with Inner Circle and Elite Circle.</li>
        ) : null}
        {tier === 'member' ? (
          <li>
            Standard events can be attended by free members with advance payment.
          </li>
        ) : null}
        {tier === 'inner_circle' ? (
          <li>
            Inner Circle includes {INNER_CIRCLE_FREE_REGISTRATIONS_PER_PERIOD}{' '}
            standard event registrations per billing period. Circle Socials are
            included at no additional cost.
          </li>
        ) : null}
        {tier === 'elite_circle' ? (
          <li>Elite Circle includes unlimited standard event registrations.</li>
        ) : null}
      </ul>

      {registrationPreview &&
      !registrationPreview.allowed &&
      registrationPreview.code === 'circle_social_blocked' ? (
        <Link href="/upgrade" className={`${buttonPrimaryClassName} mt-4 inline-flex`}>
          View memberships
        </Link>
      ) : null}
    </Card>
  )
}
