import Link from 'next/link'
import Card from '@/components/ui/card'
import { buttonPrimaryClassName } from '@/lib/event-labels'
import type { MemberEntitlements } from '@/lib/membership-entitlements'
import type { EventRegistrationDecision } from '@/lib/membership-tier-config'
import type { EventAccessType } from '@/lib/membership-tier-config'
import { eventCardAccessHint } from '@/lib/event-display'
import {
  ELITE_CIRCLE_PREMIUM_CREDITS_PER_PERIOD,
  formatFeeCents,
  INNER_CIRCLE_PREMIUM_CREDITS_PER_PERIOD,
} from '@/lib/membership-tier-config'

function formatWindow(iso: string | null | undefined): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString()
}

export default function EventAccessInfo({
  eventType,
  entitlements,
  registrationPreview,
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

  const accessHint = eventCardAccessHint({
    registrationPreview,
    currentUserStatus: null,
    isPast,
    isCancelled,
  })

  const tier = entitlements?.productTier ?? 'member'
  const feeLabel = feeCents != null ? `$${formatFeeCents(feeCents)}` : null
  const priorityLabel = formatWindow(priorityRsvpOpensAt)
  const generalLabel = formatWindow(generalRsvpOpensAt)

  return (
    <Card padding="sm" className="mb-8 border-accent/20 bg-accent-soft/20">
      <p className="eyebrow">Access</p>
      {accessHint ? (
        <p className="mt-2 text-sm font-medium text-foreground">{accessHint}</p>
      ) : null}

      <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
        {eventType === 'standard_event' ? (
          <li>Standard events are free for all approved members.</li>
        ) : null}
        {eventType === 'circle_social' ? (
          <li>
            Circle Socials are free for Inner Circle and Elite Circle. Free
            members can attend by paying the event fee. Elite gets priority RSVP
            when a priority window is set.
          </li>
        ) : null}
        {eventType === 'premium_event' ? (
          <li>
            Premium events use membership credits or an event fee. Inner Circle
            includes {INNER_CIRCLE_PREMIUM_CREDITS_PER_PERIOD} credit per period;
            Elite includes {ELITE_CIRCLE_PREMIUM_CREDITS_PER_PERIOD}.
          </li>
        ) : null}
        {feeLabel ? <li>Event fee: {feeLabel}</li> : null}
        {priorityLabel ? (
          <li>Priority RSVP opens (Elite): {priorityLabel}</li>
        ) : null}
        {generalLabel ? <li>General RSVP opens: {generalLabel}</li> : null}
        {tier === 'inner_circle' ? (
          <li>
            You have {entitlements?.premiumCreditsRemaining ?? 0} of{' '}
            {INNER_CIRCLE_PREMIUM_CREDITS_PER_PERIOD} premium credit(s) remaining
            this billing period.
          </li>
        ) : null}
        {tier === 'elite_circle' ? (
          <li>
            You have {entitlements?.premiumCreditsRemaining ?? 0} of{' '}
            {ELITE_CIRCLE_PREMIUM_CREDITS_PER_PERIOD} premium credits and{' '}
            {entitlements?.guestInvitesRemaining ?? 0} guest invite(s) remaining
            this billing period.
          </li>
        ) : null}
      </ul>

      {registrationPreview &&
      !registrationPreview.allowed &&
      registrationPreview.code === 'priority_window' ? (
        <Link href="/upgrade" className={`${buttonPrimaryClassName} mt-4 inline-flex`}>
          View memberships
        </Link>
      ) : null}
    </Card>
  )
}
