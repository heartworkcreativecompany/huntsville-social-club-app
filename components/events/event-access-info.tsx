import Link from 'next/link'
import Card from '@/components/ui/card'
import EventRsvpWindowCountdown from '@/components/events/event-rsvp-window-countdown'
import { buttonPrimaryClassName } from '@/lib/event-labels'
import type { MemberEntitlements } from '@/lib/membership-entitlements'
import type { EventRegistrationDecision } from '@/lib/membership-tier-config'
import type { EventAccessType } from '@/lib/membership-tier-config'
import { formatFeeCents } from '@/lib/membership-tier-config'
import {
  formatEventWindowTimestamp,
  resolveEventAccessMembershipCta,
  resolveEventRsvpWindow,
} from '@/lib/event-rsvp-window'

export default function EventAccessInfo({
  eventType,
  entitlements,
  registrationPreview: _registrationPreview,
  isPast,
  isCancelled,
  feeCents = null,
  priorityRsvpOpensAt = null,
  generalRsvpOpensAt = null,
}: {
  eventType: EventAccessType
  entitlements: MemberEntitlements | null
  registrationPreview: EventRegistrationDecision | null
  isPast: boolean
  isCancelled: boolean
  feeCents?: number | null
  priorityRsvpOpensAt?: string | null
  generalRsvpOpensAt?: string | null
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

  const feeLabel = feeCents != null ? `$${formatFeeCents(feeCents)}` : null
  const window = resolveEventRsvpWindow({
    eventType,
    priorityRsvpOpensAt,
    generalRsvpOpensAt,
  })
  const membershipCta = resolveEventAccessMembershipCta({
    productTier: entitlements?.productTier,
    window,
    eventType,
  })
  const priorityLabel = formatEventWindowTimestamp(window.priorityOpensAt)
  const generalLabel = formatEventWindowTimestamp(window.generalOpensAt)
  const showWindowDetails =
    eventType === 'circle_social' || eventType === 'premium_event'

  return (
    <Card padding="sm" className="mb-8 border-accent/20 bg-accent-soft/20">
      <p className="eyebrow">Access</p>

      {showWindowDetails ? (
        <div className="mt-2">
          <p className="text-sm font-medium text-foreground">{window.label}</p>
          {window.countdownEndsAt ? (
            <EventRsvpWindowCountdown endsAtIso={window.countdownEndsAt} />
          ) : null}
        </div>
      ) : null}

      <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
        {eventType === 'standard_event' ? (
          <li>Standard events are free for all approved members.</li>
        ) : null}
        {eventType === 'circle_social' ? (
          <li>
            Circle Socials are free for Inner Circle and Elite Circle. Free
            members can attend by paying the event fee.
          </li>
        ) : null}
        {feeLabel ? <li>Event fee: {feeLabel}</li> : null}
        {window.showPriorityOpensLine && priorityLabel ? (
          <li>Priority RSVP opens (Elite): {priorityLabel}</li>
        ) : null}
        {window.showGeneralOpensLine && generalLabel ? (
          <li>General RSVP opens: {generalLabel}</li>
        ) : null}
      </ul>

      {membershipCta ? (
        <Link
          href={membershipCta.href}
          className={`${buttonPrimaryClassName} mt-4 inline-flex`}
        >
          {membershipCta.label}
        </Link>
      ) : null}
    </Card>
  )
}
