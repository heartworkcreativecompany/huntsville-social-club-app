import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  EVENT_DETAIL_SELECT_FIELDS_BASE,
  EVENT_DETAIL_SELECT_FIELDS_WITH_COVER,
  EVENT_SELECT_FIELDS_BASE,
  EVENT_SELECT_FIELDS_WITH_COVER,
} from '@/lib/event-cover-image-column'
import { EVENT_RSVP_QUESTION_SELECT_FIELDS } from '@/lib/event-rsvp-question'
import type { DirectoryMember } from '@/lib/members-discovery'
import type { UpcomingEventPreview } from '@/lib/load-upcoming-events'
import { resolveRsvpCancelRefund } from '@/lib/event-rsvp-going'
import { buildEventFeeCheckoutSessionParams } from '@/lib/stripe/event-fee-checkout'

function readRepoFile(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8')
}

describe('RSVP answers stay out of public and ordinary payloads', () => {
  it('does not include rsvp_answer on event list or upcoming preview selects', () => {
    expect(EVENT_SELECT_FIELDS_BASE).not.toContain('rsvp_answer')
    expect(EVENT_SELECT_FIELDS_WITH_COVER).not.toContain('rsvp_answer')
    expect(EVENT_SELECT_FIELDS_BASE).not.toContain('rsvp_question')
    expect(EVENT_SELECT_FIELDS_WITH_COVER).not.toContain('rsvp_question')
    expect(EVENT_DETAIL_SELECT_FIELDS_BASE).not.toContain('rsvp_answer')
    expect(EVENT_DETAIL_SELECT_FIELDS_WITH_COVER).not.toContain('rsvp_answer')

    const previewKeys: Array<keyof UpcomingEventPreview> = [
      'id',
      'title',
      'location',
      'starts_at',
      'event_type',
      'status',
    ]
    expect(previewKeys).not.toContain('rsvp_answer' as never)
    expect(previewKeys).not.toContain('rsvp_question' as never)
  })

  it('keeps the question text on event detail selects only, never the answer', () => {
    expect(EVENT_RSVP_QUESTION_SELECT_FIELDS).toContain('rsvp_question')
    expect(EVENT_RSVP_QUESTION_SELECT_FIELDS).not.toContain('rsvp_answer')
  })

  it('does not expose answers on directory members', () => {
    const keys: Array<keyof DirectoryMember> = [
      'id',
      'contactEmail',
      'full_name',
      'role',
      'created_at',
      'membership_intent',
      'verified_at',
      'membership_status',
      'photos',
      'location_area',
      'discovery_intent',
      'location_city',
      'location_zip',
      'birth_year',
      'discovery_interests',
      'discovery_industry',
      'public_intents',
      'verification_state',
      'membership_tier',
      'vendor_reviewed_badge',
      'recognitionBadges',
    ]
    expect(keys).not.toContain('rsvp_answer' as never)
  })

  it('does not put answers in notification queries, emails, or Stripe metadata', () => {
    const notifications = readRepoFile('lib/load-member-notifications.ts')
    expect(notifications).not.toContain('rsvp_answer')

    const emailHandler = readRepoFile(
      'supabase/functions/application-status-email/handler.ts'
    )
    expect(emailHandler).not.toContain('rsvp_answer')

    const params = buildEventFeeCheckoutSessionParams({
      eventId: 'event-1',
      eventTitle: 'Mixer',
      feeCents: 2500,
      userId: 'user-1',
      customerId: 'cus_1',
    })
    expect(params.metadata).not.toHaveProperty('rsvp_answer')
    expect(JSON.stringify(params)).not.toContain('rsvp_answer')
    expect(JSON.stringify(params.line_items)).not.toContain('rsvp_answer')
    expect(JSON.stringify(params.payment_intent_data)).not.toContain(
      'rsvp_answer'
    )
  })

  it('keeps events-list attendee reads to status counts only', () => {
    const eventsPage = readRepoFile('app/(club)/events/page.tsx')
    expect(eventsPage).toContain(".select('event_id, user_id, status')")
    expect(eventsPage).not.toContain('rsvp_answer')
  })
})

describe('existing RSVP-adjacent flows stay unchanged', () => {
  it('does not refund credits on cancel', () => {
    expect(resolveRsvpCancelRefund()).toEqual({
      refundCredit: false,
      refundPayment: false,
      creditDelta: 0,
    })
  })

  it('does not write rsvp_answer in guest invite updates', () => {
    const guestInvites = readRepoFile('app/(club)/events/guest-invite-actions.ts')
    expect(guestInvites).toContain('guest_name')
    expect(guestInvites).not.toContain('rsvp_answer')
  })

  it('copies a pending answer onto Going only after confirmed paid webhook transfer', () => {
    const checkout = readRepoFile('lib/stripe/event-fee-checkout.ts')
    expect(checkout).toContain('resolvePendingRsvpAnswerDisposition')
    expect(checkout).toContain('pendingRsvpAnswerMayBeDeleted')
    expect(checkout).toContain('loadPendingRsvpAnswer')
    expect(checkout).not.toContain('session.metadata?.rsvp_answer')
  })

  it('enforces required answers in both the RSVP UI and server Going path', () => {
    const ui = readRepoFile('app/(club)/events/event-rsvp.tsx')
    const server = readRepoFile('app/(club)/events/rsvp-actions.ts')
    expect(ui).toContain('goingRsvpAnswerRejection')
    expect(server).toContain('goingRsvpAnswerRejection')
  })
})

describe('pending paid-checkout answers stay off host and public surfaces', () => {
  it('restricts pending-answer RLS to the member’s own row', () => {
    const migration = readRepoFile(
      'supabase/migrations/20260910010000_event_rsvp_pending_answers.sql'
    )
    expect(migration).toContain('enable row level security')
    expect(migration).toContain('user_id = (select auth.uid())')
    expect(migration).not.toContain('is_admin')
    expect(migration).not.toContain('owner_id')
    expect(migration).not.toContain('to anon')
    expect(migration).toContain('to authenticated')
    expect(migration).toContain('to service_role')
  })

  it('does not let paid checkout insert a host-visible not_going placeholder', () => {
    const rsvpActions = readRepoFile('app/(club)/events/rsvp-actions.ts')
    expect(rsvpActions).toContain('startPaidGoingAfterPersistingAnswer')
    expect(rsvpActions).toContain('paidCheckoutAttendeeWrite')
    expect(rsvpActions).toContain('persistPaidCheckoutPendingAnswer')
    expect(rsvpActions).not.toContain("status: 'not_going',\n            payment_status: 'pending',\n            ...answerPatch")
    expect(rsvpActions).not.toMatch(
      /existing: false[\s\S]*status: 'not_going'/
    )
  })

  it('builds host attendee lists, CSV, and counts from event_attendees only', () => {
    const eventPage = readRepoFile('app/(club)/events/[id]/page.tsx')
    expect(eventPage).toContain("from('event_attendees')")
    expect(eventPage).toContain('exportRows: AttendeeExportRow[] = (attendeeRows ?? []).map')
    expect(eventPage).toContain('loadPendingRsvpAnswer')
    expect(eventPage).not.toMatch(
      /exportRows[\s\S]*event_rsvp_pending_answers/
    )
    expect(eventPage).not.toMatch(
      /goingRows[\s\S]*event_rsvp_pending_answers/
    )

    const eventsPage = readRepoFile('app/(club)/events/page.tsx')
    expect(eventsPage).not.toContain('event_rsvp_pending_answers')
    expect(eventsPage).not.toContain('rsvp_answer')
  })

  it('does not put pending answers in ledger, notifications, or emails', () => {
    const rsvpActions = readRepoFile('app/(club)/events/rsvp-actions.ts')
    expect(rsvpActions).not.toMatch(
      /appendRegistrationLedger[\s\S]{0,400}rsvp_answer/
    )

    const notifications = readRepoFile('lib/load-member-notifications.ts')
    expect(notifications).not.toContain('event_rsvp_pending_answers')
    expect(notifications).not.toContain('rsvp_answer')
  })
})
