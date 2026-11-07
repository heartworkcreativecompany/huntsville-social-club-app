export const ADMISSION_SOURCES = [
  'paid',
  'circle_social_credit',
  'premium_event_credit',
  'included',
  'free',
] as const

export type AdmissionSource = (typeof ADMISSION_SOURCES)[number]

const TICKET_SENTENCE =
  'This email is your ticket. Show it at check-in, or give the host the name and email you registered with.'

const TICKET_POLICY =
  'Changing your RSVP does not return credits or event fees.'

export function isAdmissionSource(value: unknown): value is AdmissionSource {
  return (
    typeof value === 'string' &&
    (ADMISSION_SOURCES as readonly string[]).includes(value)
  )
}

export function formatTicketDollars(cents: number): string {
  const amount = Number.isFinite(cents) ? Math.max(0, Math.trunc(cents)) : 0
  const dollars = Math.floor(amount / 100)
  const remainder = amount % 100
  return `$${dollars}.${String(remainder).padStart(2, '0')}`
}

export function eventTicketAdmissionLine(input: {
  admissionSource: AdmissionSource
  amountPaidCents: number
  creditsRemaining: number | null
}): string {
  const remaining = input.creditsRemaining ?? 0
  switch (input.admissionSource) {
    case 'paid':
      return `Paid: ${formatTicketDollars(input.amountPaidCents)}`
    case 'circle_social_credit':
      return `Covered by your Circle Social credit (${remaining} left)`
    case 'premium_event_credit':
      return `Covered by your Premium Event credit (${remaining} left)`
    case 'included':
      return 'Included with your membership'
    case 'free':
      return 'Free admission'
  }
}

export type EventTicketMessageInput = {
  eventName: string
  schedule: string
  venue: string
  attendeeName: string
  admissionSource: AdmissionSource
  amountPaidCents: number
  creditsRemaining: number | null
  confirmationCode: string
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function plainLine(value: string): string {
  return value.replace(/[—–]/g, '-').replace(/\s+/g, ' ').trim()
}

export function buildEventTicketMessage(input: EventTicketMessageInput): {
  subject: string
  title: string
  bodyHtml: string
  plainText: string
} {
  const eventName = plainLine(input.eventName) || 'your event'
  const schedule = plainLine(input.schedule) || 'to be announced'
  const venue = plainLine(input.venue) || 'to be announced'
  const attendeeName = plainLine(input.attendeeName) || 'Guest'
  const confirmationCode = plainLine(input.confirmationCode)
  const admissionLine = eventTicketAdmissionLine(input)
  const subject = `You're on the list! Your ticket for ${eventName}`
  const lines = [
    `Event: ${eventName}`,
    `When: ${schedule}`,
    `Venue: ${venue}`,
    `Attendee: ${attendeeName}`,
    admissionLine,
    `Confirmation code: ${confirmationCode}`,
    TICKET_SENTENCE,
    TICKET_POLICY,
  ]

  return {
    subject,
    title: "You're on the list!",
    bodyHtml: lines.map((line) => `<p>${escapeHtml(line)}</p>`).join(''),
    plainText: [
      lines[0],
      lines[1],
      lines[2],
      lines[3],
      lines[4],
      lines[5],
      '',
      TICKET_SENTENCE,
      '',
      TICKET_POLICY,
    ].join('\n'),
  }
}
