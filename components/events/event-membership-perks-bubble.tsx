import EventGuestInviteControls from '@/components/events/event-guest-invite-controls'

export default function EventMembershipPerksBubble({
  creditSummary,
  eventId,
  eventType,
  isGoing,
  guestName,
  guestInviteConsumed,
  guestInvitesRemaining,
  isElite,
}: {
  creditSummary: string
  eventId: string
  eventType: string | null
  isGoing: boolean
  guestName: string | null
  guestInviteConsumed: boolean
  guestInvitesRemaining: number
  isElite: boolean
}) {
  return (
    <div className="mb-6 rounded-2xl border border-accent/40 bg-surface-elevated/40 px-5 py-4">
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
      />
    </div>
  )
}
