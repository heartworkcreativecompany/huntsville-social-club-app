import {
  attendeeRosterTotals,
  paidGuestAmountLabel,
  type PaidGuestRegistration,
} from '@/lib/event-paid-guest-roster'

export function AttendeeRosterSummary({
  membersGoing,
  paidGuests,
}: {
  membersGoing: number
  paidGuests: number
}) {
  const totals = attendeeRosterTotals(membersGoing, paidGuests)
  return (
    <p className="mb-4 text-sm text-muted-foreground">
      <span>Members going</span> {totals.membersGoing}
      <span className="mx-2 text-border">·</span>
      <span>Paid guests</span> {totals.paidGuests}
      <span className="mx-2 text-border">·</span>
      <span>Total</span> {totals.total}
    </p>
  )
}

export function PaidGuestAttendeeItems({
  guests,
}: {
  guests: readonly PaidGuestRegistration[]
}) {
  return guests.map((guest) => {
    const answer = guest.rsvp_answer?.trim() ?? ''
    return (
      <li key={guest.id} className="text-sm text-foreground">
        <span>{guest.full_name}</span>
        <span className="ml-2 text-xs font-medium tracking-wide text-muted-foreground">
          Guest
        </span>
        <p className="mt-0.5 text-xs text-muted-foreground">{guest.email}</p>
        {answer ? (
          <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">
            {answer}
          </p>
        ) : null}
        <p className="mt-0.5 text-xs text-muted-foreground">
          {paidGuestAmountLabel(guest.amount_cents)}
        </p>
      </li>
    )
  })
}
