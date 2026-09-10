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

    const metadata = buildEventFeeCheckoutSessionParams({
      eventId: 'event-1',
      eventTitle: 'Mixer',
      feeCents: 2500,
      userId: 'user-1',
      customerId: 'cus_1',
    }).metadata
    expect(metadata).not.toHaveProperty('rsvp_answer')
    expect(JSON.stringify(metadata)).not.toContain('rsvp_answer')
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

  it('does not include rsvp_answer in the paid-event webhook Going payload', () => {
    const checkout = readRepoFile('lib/stripe/event-fee-checkout.ts')
    expect(checkout).toContain("status: 'going' as const")
    expect(checkout).not.toContain('rsvp_answer')
  })

  it('enforces required answers in both the RSVP UI and server Going path', () => {
    const ui = readRepoFile('app/(club)/events/event-rsvp.tsx')
    const server = readRepoFile('app/(club)/events/rsvp-actions.ts')
    expect(ui).toContain('goingRsvpAnswerRejection')
    expect(server).toContain('goingRsvpAnswerRejection')
  })
})
