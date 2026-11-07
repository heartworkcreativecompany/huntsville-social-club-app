import { BRAND_THEME } from '@/lib/brand-theme'
import { EVENT_TIME_ZONE } from '@/lib/event-time'

export const ADMISSION_SOURCES = [
  'paid',
  'circle_social_credit',
  'premium_event_credit',
  'included',
  'free',
] as const

export type AdmissionSource = (typeof ADMISSION_SOURCES)[number]

export const TICKET_EMAIL_LOGO_PATH = '/brand/HSC-white-gold-logo.png'
export const TICKET_EMAIL_COVER_FALLBACK_PATH = '/brand/hsc-event-rooftop.jpg'

const CHECK_IN_LINE =
  'Show this at check-in, or give your host the name and email you registered with.'
const ARRIVE_LINE =
  'Arrive a few minutes early so we can check you in and make introductions.'
const PAID_OR_CREDIT_POLICY =
  'Plans changed? You can update your RSVP in the app. Credits and event fees are not returned.'
const FREE_OR_INCLUDED_POLICY =
  'Plans changed? Please update your RSVP in the app so someone else can take your spot.'
const FOOTER_QUESTIONS =
  'Questions? Just reply to this email or write hello@huntsvillesocialclub.com.'
const FOOTER_BRAND =
  'Huntsville Social Club · members.huntsvillesocialclub.com'

const GOLD = BRAND_THEME.gold
const CANVAS = BRAND_THEME.background
const CARD = BRAND_THEME.surface
const WHITE = BRAND_THEME.foreground
const BODY = BRAND_THEME.mutedForeground
const INK = BRAND_THEME.goldForeground
const HEADING_FONT = "'Montserrat',Arial,sans-serif"
const BODY_FONT = "'Raleway',Arial,sans-serif"

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

export function eventTicketPolicyLine(source: AdmissionSource): string {
  if (
    source === 'paid' ||
    source === 'circle_social_credit' ||
    source === 'premium_event_credit'
  ) {
    return PAID_OR_CREDIT_POLICY
  }
  return FREE_OR_INCLUDED_POLICY
}

export type EventTicketMessageInput = {
  eventName: string
  schedule?: string
  venue: string
  attendeeName: string
  firstName?: string | null
  admissionSource: AdmissionSource
  amountPaidCents: number
  creditsRemaining: number | null
  confirmationCode: string
  startsAt?: string | null
  endsAt?: string | null
  eventId?: string | null
  coverImageUrl?: string | null
  origin?: string
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

function emailOrigin(value: string | undefined): string {
  const trimmed = value?.trim().replace(/\/$/, '')
  return trimmed || 'https://members.huntsvillesocialclub.com'
}

function publicAsset(origin: string, value: string | null | undefined, fallbackPath: string): string {
  const raw = value?.trim() ?? ''
  if (/^https?:\/\//i.test(raw)) return raw
  if (raw.startsWith('/') && !raw.startsWith('//')) return `${origin}${raw}`
  return `${origin}${fallbackPath}`
}

function greetingName(firstName: string | null | undefined, attendeeName: string): string {
  const preferred = plainLine(firstName ?? '')
  if (preferred) return preferred
  const fromFull = plainLine(attendeeName).split(/\s+/)[0]
  return fromFull || 'there'
}

type ClockParts = {
  weekday: string
  month: string
  day: string
  clock: string
}

function clockParts(iso: string): ClockParts | null {
  const instant = new Date(iso)
  if (Number.isNaN(instant.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT_TIME_ZONE,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(instant)
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  const weekday = read('weekday')
  const month = read('month')
  const day = read('day')
  const hour = read('hour')
  const minute = read('minute')
  const dayPeriod = read('dayPeriod')
  if (!weekday || !month || !day || !hour || !minute || !dayPeriod) return null
  return {
    weekday,
    month,
    day,
    clock: `${hour}:${minute} ${dayPeriod}`,
  }
}

function whenLines(input: EventTicketMessageInput): { date: string; time: string } {
  const start = input.startsAt ? clockParts(input.startsAt) : null
  if (!start) {
    return { date: plainLine(input.schedule ?? '') || 'to be announced', time: '' }
  }
  const end = input.endsAt ? clockParts(input.endsAt) : null
  return {
    date: `${start.weekday}, ${start.month} ${start.day}`,
    time: end ? `${start.clock} to ${end.clock}` : start.clock,
  }
}

function googleUtc(iso: string): string | null {
  const instant = new Date(iso)
  if (Number.isNaN(instant.getTime())) return null
  return instant.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

export function eventTicketCalendarUrl(input: {
  title: string
  startsAt?: string | null
  endsAt?: string | null
  location: string
}): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: plainLine(input.title) || 'Huntsville Social Club event',
    location: plainLine(input.location),
  })
  const start = input.startsAt ? googleUtc(input.startsAt) : null
  if (start) {
    const end = (input.endsAt ? googleUtc(input.endsAt) : null) ?? start
    params.set('dates', `${start}/${end}`)
  }
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

function eventPageUrl(origin: string, eventId: string | null | undefined): string {
  const id = plainLine(eventId ?? '')
  if (!id) return `${origin}/events`
  return `${origin}/events/${encodeURIComponent(id)}`
}

function fieldRow(label: string, valueHtml: string): string {
  return `<tr>
    <td style="padding:0 0 4px;font-family:${HEADING_FONT};font-size:11px;line-height:1.2;letter-spacing:1.6px;font-weight:600;color:${GOLD};">${label}</td>
  </tr>
  <tr>
    <td style="padding:0 0 16px;font-family:${BODY_FONT};font-size:16px;line-height:1.45;color:${WHITE};">${valueHtml}</td>
  </tr>`
}

export function buildEventTicketMessage(input: EventTicketMessageInput): {
  subject: string
  html: string
  plainText: string
} {
  const origin = emailOrigin(input.origin)
  const eventName = plainLine(input.eventName) || 'your event'
  const venue = plainLine(input.venue) || 'to be announced'
  const attendeeName = plainLine(input.attendeeName) || 'Guest'
  const firstName = greetingName(input.firstName, attendeeName)
  const confirmationCode = plainLine(input.confirmationCode)
  const admissionLine = eventTicketAdmissionLine(input)
  const policyLine = eventTicketPolicyLine(input.admissionSource)
  const when = whenLines(input)
  const greeting = `Hi ${firstName}, your spot is confirmed. We can't wait to see you there.`
  const subject = `You're on the list for ${eventName}`
  const viewUrl = eventPageUrl(origin, input.eventId)
  const calendarUrl = eventTicketCalendarUrl({
    title: eventName,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    location: venue,
  })
  const logoUrl = `${origin}${TICKET_EMAIL_LOGO_PATH}`
  const coverUrl = publicAsset(origin, input.coverImageUrl, TICKET_EMAIL_COVER_FALLBACK_PATH)
  const whenHtml = when.time
    ? `${escapeHtml(when.date)}<br /><span style="color:${BODY};">${escapeHtml(when.time)}</span>`
    : escapeHtml(when.date)
  const admissionHtml = `<span style="display:inline-block;background:${GOLD};color:${INK};border-radius:999px;padding:6px 12px;font-family:${HEADING_FONT};font-size:12px;line-height:1.2;font-weight:600;">${escapeHtml(admissionLine)}</span>`

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700&amp;family=Raleway:wght@400;600&amp;display=swap" />
</head>
<body style="margin:0;padding:0;background:${CANVAS};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${CANVAS}" style="background:${CANVAS};margin:0;padding:0;">
    <tr>
      <td align="center" style="padding:28px 16px 40px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:560px;">
          <tr>
            <td align="center" style="padding:0 0 24px;">
              <img src="${escapeHtml(logoUrl)}" alt="Huntsville Social Club" width="200" height="105" border="0" style="display:block;width:200px;height:105px;border:0;outline:none;text-decoration:none;margin:0 auto;" />
            </td>
          </tr>
          <tr>
            <td bgcolor="${CARD}" style="background:${CARD};border-radius:18px;padding:20px 20px 28px;">
              <img src="${escapeHtml(coverUrl)}" alt="" width="520" border="0" style="display:block;width:100%;max-width:520px;height:auto;border:0;border-radius:12px;outline:none;text-decoration:none;margin:0 0 22px;" />
              <p style="margin:0 0 8px;font-family:${HEADING_FONT};font-size:11px;line-height:1.2;letter-spacing:1.8px;font-weight:600;color:${GOLD};">YOU'RE ON THE LIST</p>
              <h1 style="margin:0 0 12px;font-family:${HEADING_FONT};font-size:32px;line-height:1.15;font-weight:600;color:${WHITE};">${escapeHtml(eventName)}</h1>
              <p style="margin:0 0 22px;font-family:${BODY_FONT};font-size:16px;line-height:1.5;color:${BODY};">${escapeHtml(greeting)}</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${GOLD};border-radius:14px;background:${CANVAS};">
                <tr>
                  <td style="padding:20px 18px 4px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      ${fieldRow('WHEN', whenHtml)}
                      ${fieldRow('WHERE', escapeHtml(venue))}
                      ${fieldRow('ATTENDEE', escapeHtml(attendeeName))}
                      ${fieldRow('ADMISSION', admissionHtml)}
                      <tr>
                        <td style="padding:16px 0 6px;border-top:1px dashed ${GOLD};font-family:${HEADING_FONT};font-size:11px;line-height:1.2;letter-spacing:1.6px;font-weight:600;color:${GOLD};">CONFIRMATION CODE</td>
                      </tr>
                      <tr>
                        <td style="padding:0 0 8px;font-family:${HEADING_FONT};font-size:28px;line-height:1.2;letter-spacing:4px;font-weight:600;color:${GOLD};">${escapeHtml(confirmationCode)}</td>
                      </tr>
                      <tr>
                        <td style="padding:0;font-family:${BODY_FONT};font-size:14px;line-height:1.5;color:${BODY};">${escapeHtml(CHECK_IN_LINE)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;">
                <tr>
                  <td style="padding:0 8px 0 0;">
                    <a href="${escapeHtml(viewUrl)}" style="display:inline-block;background:${GOLD};border:1px solid ${GOLD};color:${INK};font-family:${HEADING_FONT};font-size:14px;line-height:1;font-weight:600;text-decoration:none;border-radius:999px;padding:14px 22px;">View event</a>
                  </td>
                  <td>
                    <a href="${escapeHtml(calendarUrl)}" style="display:inline-block;background:transparent;border:1px solid ${GOLD};color:${GOLD};font-family:${HEADING_FONT};font-size:14px;line-height:1;font-weight:600;text-decoration:none;border-radius:999px;padding:14px 22px;">Add to calendar</a>
                  </td>
                </tr>
              </table>
              <p style="margin:28px 0 8px;font-family:${HEADING_FONT};font-size:11px;line-height:1.2;letter-spacing:1.8px;font-weight:600;color:${GOLD};">GOOD TO KNOW</p>
              <p style="margin:0 0 8px;font-family:${BODY_FONT};font-size:15px;line-height:1.5;color:${WHITE};">${escapeHtml(ARRIVE_LINE)}</p>
              <p style="margin:0;font-family:${BODY_FONT};font-size:15px;line-height:1.5;color:${BODY};">${escapeHtml(policyLine)}</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:24px 12px 0;font-family:${BODY_FONT};font-size:13px;line-height:1.5;color:${BODY};">
              ${escapeHtml(FOOTER_QUESTIONS)}<br />
              ${escapeHtml(FOOTER_BRAND)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const plainText = [
    "YOU'RE ON THE LIST",
    '',
    eventName,
    '',
    greeting,
    '',
    `When: ${when.date}`,
    when.time ? when.time : null,
    `Where: ${venue}`,
    `Attendee: ${attendeeName}`,
    `Admission: ${admissionLine}`,
    '',
    `Confirmation code: ${confirmationCode}`,
    CHECK_IN_LINE,
    '',
    `View event: ${viewUrl}`,
    `Add to calendar: ${calendarUrl}`,
    '',
    'GOOD TO KNOW',
    ARRIVE_LINE,
    policyLine,
    '',
    FOOTER_QUESTIONS,
    FOOTER_BRAND,
  ]
    .filter((line): line is string => line !== null)
    .join('\n')

  return { subject, html, plainText }
}
