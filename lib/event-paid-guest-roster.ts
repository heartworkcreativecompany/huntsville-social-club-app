import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { formatFeeCents } from '@/lib/membership-tier-config'

export type AttendeeExportRow = {
  eventTitle: string
  eventDate: string
  attendeeType: 'Member' | 'Guest'
  attendeeName: string
  attendeeEmail: string
  rsvpStatus: string
  rsvpAnswer: string
  respondedAt: string
}

/** Columns an event owner or admin may read for check-in. Never select *. */
export const PAID_GUEST_ROSTER_SELECT =
  'id, full_name, email, status, amount_cents, rsvp_answer, paid_at, created_at'

export type PaidGuestRegistration = {
  id: string
  full_name: string
  email: string
  status: string
  amount_cents: number
  rsvp_answer: string | null
  paid_at: string | null
  created_at: string
}

export type AttendeeRosterTotals = {
  membersGoing: number
  paidGuests: number
  total: number
}

type GuestRosterClient = SupabaseClient<Database>

export function canViewEventAttendeeRoster(input: {
  viewerId: string
  eventOwnerId: string
  role: string | null | undefined
}): boolean {
  return input.viewerId === input.eventOwnerId || input.role === 'admin'
}

export function visiblePaidGuestRegistrations<T extends { status: string }>(
  rows: readonly T[]
): T[] {
  return rows.filter((row) => row.status === 'paid')
}

export function paidGuestAmountLabel(amountCents: number): string {
  return `Paid $${formatFeeCents(amountCents)}`
}

export function attendeeRosterTotals(
  membersGoing: number,
  paidGuests: number
): AttendeeRosterTotals {
  return {
    membersGoing,
    paidGuests,
    total: membersGoing + paidGuests,
  }
}

export function paidGuestExportRows(input: {
  guests: readonly PaidGuestRegistration[]
  eventTitle: string
  eventDate: string
}): AttendeeExportRow[] {
  return visiblePaidGuestRegistrations(input.guests).map((guest) => ({
    eventTitle: input.eventTitle,
    eventDate: input.eventDate,
    attendeeType: 'Guest',
    attendeeName: guest.full_name,
    attendeeEmail: guest.email,
    rsvpStatus: 'paid',
    rsvpAnswer: guest.rsvp_answer?.trim() ?? '',
    respondedAt: new Date(guest.paid_at ?? guest.created_at).toLocaleString(),
  }))
}

export function rosterForViewer(input: {
  viewerId: string
  eventOwnerId: string
  role: string | null | undefined
  membersGoing: number
  guestRows: readonly PaidGuestRegistration[]
}): {
  guests: PaidGuestRegistration[]
  totals: AttendeeRosterTotals
} {
  const guests = canViewEventAttendeeRoster(input)
    ? visiblePaidGuestRegistrations(input.guestRows)
    : []
  return {
    guests,
    totals: attendeeRosterTotals(input.membersGoing, guests.length),
  }
}

export async function loadPaidGuestRegistrations(
  supabase: GuestRosterClient,
  eventId: string
): Promise<PaidGuestRegistration[]> {
  const { data, error } = await supabase
    .from('guest_event_registrations')
    .select(PAID_GUEST_ROSTER_SELECT)
    .eq('event_id', eventId)
    .eq('status', 'paid')

  if (error || !data) return []
  return visiblePaidGuestRegistrations(data)
}
