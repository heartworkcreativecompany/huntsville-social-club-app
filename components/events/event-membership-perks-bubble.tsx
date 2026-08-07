'use client'

import EventGuestInviteControls from '@/components/events/event-guest-invite-controls'
import { PREMIUM_BUBBLE_GOLD_CLASSNAME } from '@/lib/event-rsvp-window'
import type { MembershipPerksSnapshot } from '@/lib/event-rsvp-window'

export default function EventMembershipPerksBubble({
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
  creditSummary: string
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
  return (
    <div className={PREMIUM_BUBBLE_GOLD_CLASSNAME}>
      <p className="text-base font-semibold text-accent">Membership Perks</p>
      <p className="mt-2 text-sm leading-relaxed text-foreground">
        {creditSummary}
      </p>
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
