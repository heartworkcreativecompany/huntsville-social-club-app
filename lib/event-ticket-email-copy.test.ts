import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildEventTicketMessage,
  eventTicketAdmissionLine,
} from '@/lib/event-ticket-email-copy'
import { sendEventTicketEmail } from '@/lib/transactional-email'

const message = {
  eventName: 'Rooftop Social',
  schedule: 'Thu, Oct 15, 6:00 PM',
  venue: 'Lipz Lounge',
  attendeeName: 'Ada Lovelace',
  admissionSource: 'paid' as const,
  amountPaidCents: 2500,
  creditsRemaining: null,
  confirmationCode: 'AB23CD45',
}

describe('event ticket email copy', () => {
  it('names each admission without an em dash', () => {
    expect(
      eventTicketAdmissionLine({
        admissionSource: 'paid',
        amountPaidCents: 2500,
        creditsRemaining: null,
      })
    ).toBe('Paid: $25.00')
    expect(
      eventTicketAdmissionLine({
        admissionSource: 'circle_social_credit',
        amountPaidCents: 0,
        creditsRemaining: 1,
      })
    ).toBe('Covered by your Circle Social credit (1 left)')
    expect(
      eventTicketAdmissionLine({
        admissionSource: 'premium_event_credit',
        amountPaidCents: 0,
        creditsRemaining: 0,
      })
    ).toBe('Covered by your Premium Event credit (0 left)')
    expect(
      eventTicketAdmissionLine({
        admissionSource: 'included',
        amountPaidCents: 0,
        creditsRemaining: null,
      })
    ).toBe('Included with your membership')
    expect(
      eventTicketAdmissionLine({
        admissionSource: 'free',
        amountPaidCents: 0,
        creditsRemaining: null,
      })
    ).toBe('Free admission')

    const built = buildEventTicketMessage(message)
    expect(built.subject).toBe("You're on the list! Your ticket for Rooftop Social")
    expect(built.plainText).toContain('Event: Rooftop Social')
    expect(built.plainText).toContain('When: Thu, Oct 15, 6:00 PM')
    expect(built.plainText).toContain('Venue: Lipz Lounge')
    expect(built.plainText).toContain('Attendee: Ada Lovelace')
    expect(built.plainText).toContain('Paid: $25.00')
    expect(built.plainText).toContain('Confirmation code: AB23CD45')
    expect(built.plainText).toContain(
      'This email is your ticket. Show it at check-in, or give the host the name and email you registered with.'
    )
    expect(built.plainText).toContain(
      'Changing your RSVP does not return credits or event fees.'
    )
    expect(`${built.subject}\n${built.plainText}\n${built.bodyHtml}`).not.toMatch(/[—–]/)
  })
})

describe('sendEventTicketEmail', () => {
  const originalKey = process.env.RESEND_API_KEY
  const originalFrom = process.env.EMAIL_FROM
  const originalCapture = process.env.EMAIL_CAPTURE_DIR

  afterEach(() => {
    process.env.RESEND_API_KEY = originalKey
    process.env.EMAIL_FROM = originalFrom
    process.env.EMAIL_CAPTURE_DIR = originalCapture
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('sends the ticket subject and check-in instructions', async () => {
    delete process.env.EMAIL_CAPTURE_DIR
    process.env.RESEND_API_KEY = 'test-key'
    process.env.EMAIL_FROM = 'Huntsville Social Club <tickets@example.com>'
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: 're_ticket_1' }),
      text: async () => '',
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await sendEventTicketEmail({
      to: 'ada@example.com',
      ...message,
    })

    expect(result).toEqual({ sent: true, id: 're_ticket_1' })
    const payload = JSON.parse(
      String(
        (fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body
      )
    ) as { subject: string; text: string }
    expect(payload.subject).toBe("You're on the list! Your ticket for Rooftop Social")
    expect(payload.text).toContain('Confirmation code: AB23CD45')
    expect(payload.text).toContain(
      'This email is your ticket. Show it at check-in, or give the host the name and email you registered with.'
    )
    expect(payload.text).not.toMatch(/[—–]/)
  })
})
