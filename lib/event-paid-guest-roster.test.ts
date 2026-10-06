import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  ATTENDEE_EXPORT_HEADERS,
  buildAttendeeCsv,
} from '@/app/(club)/events/[id]/export-attendees-csv'
import {
  AttendeeRosterSummary,
  PaidGuestAttendeeItems,
} from '@/components/events/paid-guest-attendees'
import {
  PAID_GUEST_ROSTER_SELECT,
  attendeeRosterTotals,
  canViewEventAttendeeRoster,
  loadPaidGuestRegistrations,
  paidGuestAmountLabel,
  paidGuestExportRows,
  rosterForViewer,
  visiblePaidGuestRegistrations,
  type PaidGuestRegistration,
} from '@/lib/event-paid-guest-roster'

const OWNER_ID = 'owner-1'
const ADMIN_ID = 'admin-1'
const MEMBER_ID = 'member-1'

function guest(
  overrides: Partial<PaidGuestRegistration> = {}
): PaidGuestRegistration {
  return {
    id: 'guest-1',
    full_name: 'Riley Chen',
    email: 'riley@example.com',
    status: 'paid',
    amount_cents: 1500,
    rsvp_answer: 'Window seat',
    paid_at: '2026-10-15T23:00:00.000Z',
    created_at: '2026-10-15T22:00:00.000Z',
    ...overrides,
  }
}

const mixedGuests = [
  guest(),
  guest({
    id: 'guest-pending',
    full_name: 'Pending Pat',
    email: 'pending@example.com',
    status: 'pending_payment',
  }),
  guest({
    id: 'guest-expired',
    full_name: 'Expired Erin',
    email: 'expired@example.com',
    status: 'expired',
  }),
  guest({
    id: 'guest-cancelled',
    full_name: 'Cancelled Cam',
    email: 'cancelled@example.com',
    status: 'cancelled',
  }),
  guest({
    id: 'guest-refunded',
    full_name: 'Refunded Remy',
    email: 'refunded@example.com',
    status: 'refunded',
  }),
]

function listHtml(guests: PaidGuestRegistration[]) {
  return renderToStaticMarkup(
    createElement(
      'ul',
      null,
      createElement(PaidGuestAttendeeItems, { guests })
    )
  )
}

describe('paid guest attendee roster', () => {
  it('lets the event owner and admins see paid guests in the list and export', () => {
    for (const viewer of [
      { viewerId: OWNER_ID, role: 'member' },
      { viewerId: ADMIN_ID, role: 'admin' },
    ]) {
      const roster = rosterForViewer({
        viewerId: viewer.viewerId,
        eventOwnerId: OWNER_ID,
        role: viewer.role,
        membersGoing: 2,
        guestRows: mixedGuests,
      })
      expect(roster.guests.map((row) => row.email)).toEqual([
        'riley@example.com',
      ])

      const html = listHtml(roster.guests)
      expect(html).toContain('Riley Chen')
      expect(html).toContain('Guest')
      expect(html).toContain('riley@example.com')
      expect(html).toContain('Window seat')
      expect(html).toContain('Paid $15')
      expect(html).not.toContain('pending@example.com')
      expect(html).not.toContain('expired@example.com')
      expect(html).not.toContain('cancelled@example.com')
      expect(html).not.toContain('refunded@example.com')

      const csv = buildAttendeeCsv([
        {
          eventTitle: 'Table Hop',
          eventDate: 'Thu, Oct 15',
          attendeeType: 'Member',
          attendeeName: 'Avery Member',
          attendeeEmail: 'avery@example.com',
          rsvpStatus: 'going',
          rsvpAnswer: 'Yes',
          respondedAt: 'Oct 1',
        },
        ...paidGuestExportRows({
          guests: roster.guests,
          eventTitle: 'Table Hop',
          eventDate: 'Thu, Oct 15',
        }),
      ])
      expect(csv.split('\n')[0]).toBe(ATTENDEE_EXPORT_HEADERS.join(','))
      expect(csv).toContain('Type')
      expect(csv).toContain('Member,Avery Member,avery@example.com')
      expect(csv).toContain(
        'Guest,Riley Chen,riley@example.com,paid,Window seat'
      )
      expect(csv).not.toContain('pending@example.com')
    }
  })

  it('hides pending, expired, cancelled, and refunded guests', () => {
    expect(visiblePaidGuestRegistrations(mixedGuests).map((row) => row.status)).toEqual([
      'paid',
    ])
    expect(paidGuestAmountLabel(1500)).toBe('Paid $15')
    expect(paidGuestAmountLabel(2550)).toBe('Paid $25.50')
    const html = listHtml([guest({ rsvp_answer: '   ' })])
    expect(html).not.toContain('Window seat')
    expect(html).toContain('Paid $15')
  })

  it('does not give regular members guest names or emails', () => {
    expect(
      canViewEventAttendeeRoster({
        viewerId: MEMBER_ID,
        eventOwnerId: OWNER_ID,
        role: 'member',
      })
    ).toBe(false)
    expect(
      canViewEventAttendeeRoster({
        viewerId: MEMBER_ID,
        eventOwnerId: OWNER_ID,
        role: 'host',
      })
    ).toBe(false)

    const roster = rosterForViewer({
      viewerId: MEMBER_ID,
      eventOwnerId: OWNER_ID,
      role: 'member',
      membersGoing: 2,
      guestRows: mixedGuests,
    })
    expect(roster.guests).toEqual([])
    expect(JSON.stringify(roster)).not.toContain('riley@example.com')
    expect(JSON.stringify(roster)).not.toContain('Riley Chen')
    expect(listHtml(roster.guests)).toBe('<ul></ul>')
    expect(roster.totals).toEqual({
      membersGoing: 2,
      paidGuests: 0,
      total: 2,
    })
  })

  it('adds members going and paid guests into the total', () => {
    expect(attendeeRosterTotals(2, 3)).toEqual({
      membersGoing: 2,
      paidGuests: 3,
      total: 5,
    })
    expect(attendeeRosterTotals(0, 0)).toEqual({
      membersGoing: 0,
      paidGuests: 0,
      total: 0,
    })
    const html = renderToStaticMarkup(
      createElement(AttendeeRosterSummary, { membersGoing: 2, paidGuests: 1 })
    )
    expect(html).toContain('Members going')
    expect(html).toContain('2')
    expect(html).toContain('Paid guests')
    expect(html).toContain('1')
    expect(html).toContain('Total')
    expect(html).toContain('3')
  })

  it('loads only paid rows through the authenticated select', async () => {
    const calls: Array<{ table: string; columns: string; filters: string[] }> =
      []
    const supabase = {
      from(table: string) {
        return {
          select(columns: string) {
            return {
              eq(column: string, value: string) {
                const filters = [`${column}=${value}`]
                return {
                  eq(nextColumn: string, nextValue: string) {
                    filters.push(`${nextColumn}=${nextValue}`)
                    calls.push({ table, columns, filters })
                    return Promise.resolve({
                      data: mixedGuests,
                      error: null,
                    })
                  },
                }
              },
            }
          },
        }
      },
    }

    const rows = await loadPaidGuestRegistrations(
      supabase as never,
      'event-1'
    )
    expect(calls).toEqual([
      {
        table: 'guest_event_registrations',
        columns: PAID_GUEST_ROSTER_SELECT,
        filters: ['event_id=event-1', 'status=paid'],
      },
    ])
    expect(PAID_GUEST_ROSTER_SELECT).not.toContain('stripe_')
    expect(PAID_GUEST_ROSTER_SELECT).not.toContain('*')
    expect(rows.map((row) => row.id)).toEqual(['guest-1'])
  })
})

describe('attendee page guest access', () => {
  const page = readFileSync(
    join(process.cwd(), 'app/(club)/events/[id]/page.tsx'),
    'utf8'
  )
  const loader = readFileSync(
    join(process.cwd(), 'lib/event-paid-guest-roster.ts'),
    'utf8'
  )

  it('shows paid guests only to the existing attendee audience', () => {
    expect(page).toContain('canViewEventAttendeeRoster')
    expect(page).toContain(
      'const paidGuests = canExportAttendees\n    ? await loadPaidGuestRegistrations(supabase, event.id)\n    : []'
    )
    expect(page).toContain("renderAttendeeList('Going', goingRows, paidGuests)")
    expect(page).toContain('AttendeeRosterSummary')
    expect(page).toContain("attendeeType: 'Member'")
    expect(page).toContain('paidGuestExportRows')
    expect(page).not.toContain("from '@/lib/supabase/admin'")
    expect(page).not.toContain('createAdminClient')
    expect(page).not.toContain('service_role')
    expect(loader).toContain("from('guest_event_registrations')")
    expect(loader).toContain(".eq('status', 'paid')")
    expect(loader).not.toContain("from '@/lib/supabase/admin'")
    expect(loader).not.toContain('service_role')
  })
})
