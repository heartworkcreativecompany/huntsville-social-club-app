'use client'

import EventGuestInviteControls from '@/components/events/event-guest-invite-controls'
import MembershipPerkLines from '@/components/membership/membership-perk-lines'
import { PREMIUM_BUBBLE_GOLD_CLASSNAME } from '@/lib/event-rsvp-window'
import type { MembershipPerksSnapshot } from '@/lib/event-rsvp-window'

export default function EventMembershipPerksBubble({
  perkLines,
  creditSummary,
  eventId,
  eventType,
  isGoing,
  guestName,
  guestInviteConsumed,
  guestInvitesRemaining,
  isElite,
  onGuestInviteChange,
}: {
  perkLines?: string[]
  /** @deprecated Prefer perkLines. */
  creditSummary?: string
  eventId: string
  eventType: string | null
  isGoing: boolean
  guestName: string | null
  guestInviteConsumed: boolean
  guestInvitesRemaining: number
  isElite: boolean
  onGuestInviteChange?: (input: {
    guestName: string | null
    consumed: boolean
    perks?: MembershipPerksSnapshot | null
  }) => void
}) {
  const lines =
    perkLines && perkLines.length > 0
      ? perkLines
      : creditSummary
        ? [creditSummary]
        : []

  return (
    <div className={`${PREMIUM_BUBBLE_GOLD_CLASSNAME} min-w-0 max-w-full`}>
      <p className="text-base font-semibold text-accent">Membership Perks</p>
      {lines.length > 0 ? (
        <div className="mt-2">
          <MembershipPerkLines
            lines={lines}
            className="text-sm leading-relaxed break-words text-foreground"
          />
        </div>
      ) : null}
      {isElite && guestInvitesRemaining > 0 && !isGoing ? (
        <p className="mt-2 text-sm text-muted-foreground">
          RSVP as Going to use your Elite guest invite on this premium event.
        </p>
      ) : null}
      <EventGuestInviteControls
        eventId={eventId}
        eventType={eventType}
        isGoing={isGoing}
        guestName={guestName}
        guestInviteConsumed={guestInviteConsumed}
        guestInvitesRemaining={guestInvitesRemaining}
        isElite={isElite}
        compactPrompt
        onGuestInviteChange={onGuestInviteChange}
      />
    </div>
  )
}
