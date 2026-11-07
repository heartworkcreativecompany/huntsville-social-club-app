import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  type AdmissionSource,
  buildEventTicketMessage,
  eventTicketAdmissionLine,
  TICKET_EMAIL_COVER_FALLBACK_PATH,
  TICKET_EMAIL_LOGO_PATH,
} from '@/lib/event-ticket-email-copy'
import {
  sendApplicationSubmittedEmail,
  sendEventTicketEmail,
} from '@/lib/transactional-email'

const ORIGIN = 'https://members.huntsvillesocialclub.com'
const PAID_POLICY =
  'Plans changed? You can update your RSVP in the app. Credits and event fees are not returned.'
const FREE_POLICY =
  'Plans changed? Please update your RSVP in the app so someone else can take your spot.'

const message = {
  eventName: 'Rooftop Social',
  schedule: 'Thu, Oct 15, 6:00 PM',
  venue: 'Lipz Lounge',
  attendeeName: 'Ada Lovelace',
  firstName: 'Ada',
  admissionSource: 'paid' as const,
  amountPaidCents: 2500,
  creditsRemaining: null,
  confirmationCode: 'AB23CD45',
  startsAt: '2026-10-15T23:00:00.000Z',
  endsAt: '2026-10-16T01:00:00.000Z',
  eventId: 'event-1',
  coverImageUrl: 'https://images.example.com/rooftop.jpg',
  origin: ORIGIN,
  audience: 'member' as const,
}

function built(overrides: Partial<typeof message> = {}) {
  return buildEventTicketMessage({ ...message, ...overrides })
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
  })

  it.each([
    ['paid', 'Paid: $25.00', 2500, null, PAID_POLICY],
    ['circle_social_credit', 'Covered by your Circle Social credit (1 left)', 0, 1, PAID_POLICY],
    ['premium_event_credit', 'Covered by your Premium Event credit (0 left)', 0, 0, PAID_POLICY],
    ['included', 'Included with your membership', 0, null, FREE_POLICY],
    ['free', 'Free admission', 0, null, FREE_POLICY],
  ] as const)(
    'renders the %s badge and policy',
    (admissionSource, badge, amountPaidCents, creditsRemaining, policy) => {
      const email = built({
        admissionSource: admissionSource as AdmissionSource,
        amountPaidCents,
        creditsRemaining,
      })
      const combined = `${email.subject}\n${email.plainText}\n${email.html}`

      expect(email.html).toContain(`>${badge}</span>`)
      expect(email.plainText).toContain(`Admission: ${badge}`)
      expect(email.html).toContain(policy)
      expect(email.plainText).toContain(policy)
      expect(email.html).not.toContain(
        policy === PAID_POLICY ? FREE_POLICY : PAID_POLICY
      )
      expect(email.html).toContain(TICKET_EMAIL_LOGO_PATH)
      expect(email.html).not.toContain('.svg')
      expect(email.html).toContain('YOU\'RE ON THE LIST')
      expect(email.html).toContain('Hi Ada, your spot is confirmed.')
      expect(email.html).toContain('Thu, Oct 15')
      expect(email.html).toContain('6:00 PM to 8:00 PM')
      expect(email.html).not.toContain('Fri, Oct 16')
      expect(email.html).toContain(`${ORIGIN}/events/event-1`)
      expect(email.html).toContain('calendar.google.com/calendar/render?action=TEMPLATE')
      expect(email.html).toContain('20261015T230000Z%2F20261016T010000Z')
      expect(email.plainText).toContain('Show this at check-in, or give your host the name and email you registered with.')
      expect(email.plainText).toContain('Arrive a few minutes early so we can check you in and make introductions.')
      expect(email.plainText).toContain('hello@huntsvillesocialclub.com')
      expect(email.plainText).toContain('Huntsville Social Club · members.huntsvillesocialclub.com')
      expect(combined).not.toMatch(/[—–]/)
    }
  )

  it('uses the stored cover and falls back when the event has none', () => {
    expect(built().html).toContain('https://images.example.com/rooftop.jpg')
    expect(built().html).not.toContain(TICKET_EMAIL_COVER_FALLBACK_PATH)

    const fallback = built({ coverImageUrl: null })
    expect(fallback.html).toContain(`${ORIGIN}${TICKET_EMAIL_COVER_FALLBACK_PATH}`)
    expect(fallback.html).not.toContain('https://images.example.com/rooftop.jpg')
  })

  it('escapes event and attendee text', () => {
    const email = built({
      eventName: 'Rooftop <Social> & "Night"',
      venue: 'Lipz & Lounge',
      attendeeName: 'Ada <Lovelace>',
      firstName: 'Ada <Ann>',
      confirmationCode: 'AB<23>',
    })

    expect(email.html).toContain('Rooftop &lt;Social&gt; &amp; &quot;Night&quot;')
    expect(email.html).toContain('Lipz &amp; Lounge')
    expect(email.html).toContain('Ada &lt;Lovelace&gt;')
    expect(email.html).toContain('Hi Ada &lt;Ann&gt;, your spot is confirmed.')
    expect(email.html).toContain('AB&lt;23&gt;')
    expect(email.html).not.toContain('<Social>')
    expect(email.plainText).toContain('Rooftop <Social> & "Night"')
    expect(email.subject).toBe('You\'re on the list for Rooftop <Social> & "Night"')
    expect(`${email.subject}\n${email.html}\n${email.plainText}`).not.toMatch(/[—–]/)
  })

  it('keeps a same-day end time on the start date', () => {
    const email = built({
      startsAt: '2026-11-15T01:00:00.000Z',
      endsAt: '2026-11-15T04:00:00.000Z',
    })
    expect(email.html).toContain('Sat, Nov 14')
    expect(email.html).toContain('7:00 PM to 10:00 PM')
    expect(email.html).not.toContain('Sun, Nov 15')
    expect(email.plainText).toContain('When: Sat, Nov 14')
    expect(email.plainText).toContain('7:00 PM to 10:00 PM')
    expect(email.plainText).not.toContain('Sun, Nov 15')
  })

  it('includes the end date when the event ends after midnight', () => {
    const email = built({
      startsAt: '2026-11-15T01:00:00.000Z',
      endsAt: '2026-11-15T07:00:00.000Z',
    })
    expect(email.html).toContain('Sat, Nov 14')
    expect(email.html).toContain('7:00 PM to Sun, Nov 15, 1:00 AM')
    expect(email.plainText).toContain('When: Sat, Nov 14')
    expect(email.plainText).toContain('7:00 PM to Sun, Nov 15, 1:00 AM')
    expect(`${email.html}\n${email.plainText}`).not.toMatch(/[—–]/)
  })

  it('links members to the members event page', () => {
    const email = built({ audience: 'member', eventId: 'event-1' })
    expect(email.html).toContain('https://members.huntsvillesocialclub.com/events/event-1')
    expect(email.plainText).toContain(
      'View event: https://members.huntsvillesocialclub.com/events/event-1'
    )
    expect(email.html).not.toContain('/public-events')

    const fallback = built({ audience: 'member', eventId: ' ' })
    expect(fallback.html).toContain('https://members.huntsvillesocialclub.com/events')
    expect(fallback.html).not.toContain('/public-events')
  })

  it('links guests to the public event page', () => {
    const email = built({ audience: 'guest', eventId: 'event-1' })
    expect(email.html).toContain('https://huntsvillesocialclub.com/public-events/event-1')
    expect(email.plainText).toContain(
      'View event: https://huntsvillesocialclub.com/public-events/event-1'
    )
    expect(email.html).not.toContain('members.huntsvillesocialclub.com/events')

    const fallback = built({ audience: 'guest', eventId: null })
    expect(fallback.html).toContain('https://huntsvillesocialclub.com/public-events')
    expect(fallback.html).not.toContain('/public-events/event-1')
    expect(fallback.html).not.toContain('members.huntsvillesocialclub.com/events')
  })
})

describe('sendEventTicketEmail', () => {
  const originalKey = process.env.RESEND_API_KEY
  const originalFrom = process.env.EMAIL_FROM
  const originalCapture = process.env.EMAIL_CAPTURE_DIR
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL

  afterEach(() => {
    process.env.RESEND_API_KEY = originalKey
    process.env.EMAIL_FROM = originalFrom
    process.env.EMAIL_CAPTURE_DIR = originalCapture
    if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL
    else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('sends the ticket subject and check-in instructions', async () => {
    delete process.env.EMAIL_CAPTURE_DIR
    process.env.RESEND_API_KEY = 'test-key'
    process.env.EMAIL_FROM = 'Huntsville Social Club <tickets@example.com>'
    process.env.NEXT_PUBLIC_APP_URL = ORIGIN
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: 're_ticket_1' }),
      text: async () => '',
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await sendEventTicketEmail({
      to: 'ada@example.com',
      ...message,
      outboxId: 'outbox-1',
    })

    expect(result).toEqual({ sent: true, id: 're_ticket_1' })
    const init = (
      fetchMock.mock.calls[0] as unknown as [
        string,
        { body: string; headers: Record<string, string> },
      ]
    )[1]
    expect(init.headers['Idempotency-Key']).toBe('event-ticket/outbox-1')
    const payload = JSON.parse(String(init.body)) as {
      subject: string
      text: string
      html: string
    }
    expect(payload.subject).toBe("You're on the list for Rooftop Social")
    expect(payload.text).toContain('Confirmation code: AB23CD45')
    expect(payload.text).toContain(
      'Show this at check-in, or give your host the name and email you registered with.'
    )
    expect(payload.html).toContain(TICKET_EMAIL_LOGO_PATH)
    expect(payload.html).not.toContain('.svg')
    expect(payload.text).not.toMatch(/[—–]/)
    expect(payload.html).not.toMatch(/[—–]/)
  })

  it('leaves other emails without an idempotency key and uses the png logo', async () => {
    delete process.env.EMAIL_CAPTURE_DIR
    process.env.RESEND_API_KEY = 'test-key'
    process.env.NEXT_PUBLIC_APP_URL = ORIGIN
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: 're_other' }),
      text: async () => '',
    }))
    vi.stubGlobal('fetch', fetchMock)

    await sendApplicationSubmittedEmail('ada@example.com')

    const init = (
      fetchMock.mock.calls[0] as unknown as [
        string,
        { headers: Record<string, string>; body: string },
      ]
    )[1]
    expect(init.headers['Idempotency-Key']).toBeUndefined()
    const payload = JSON.parse(String(init.body)) as { html: string; subject: string }
    expect(payload.subject).toBe('Application submitted')
    expect(payload.html).toContain(TICKET_EMAIL_LOGO_PATH)
    expect(payload.html).not.toContain('.svg')
    expect(payload.html).toContain('Your membership application has been submitted.')
  })
})
