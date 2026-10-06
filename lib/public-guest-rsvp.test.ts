import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PublicGuestRsvpForm from '@/components/marketing/public-guest-rsvp-form'
import { loadPublicGuestListingFields } from '@/lib/load-public-guest-listing'
import {
  GUEST_CHECKOUT_MESSAGES,
  beginGuestCheckout,
  guestCheckoutReturnMessage,
  guestRsvpButtonLabel,
  guestRsvpOffer,
  spotsLeftLabel,
} from '@/lib/public-guest-rsvp'

const NOW = new Date('2026-10-05T18:00:00.000Z')
const EVENT_ID = '11111111-1111-4111-8111-111111111111'

const listingState = vi.hoisted(() => ({
  row: null as null | {
    status: string
    listed_publicly: boolean
    rsvp_question: string | null
    rsvp_question_required: boolean | null
    general_rsvp_opens_at: string | null
  },
  select: '',
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table !== 'events') throw new Error(table)
      return {
        select(columns: string) {
          listingState.select = columns
          return {
            eq() {
              return {
                async maybeSingle() {
                  return { data: listingState.row, error: null }
                },
              }
            },
          }
        },
      }
    },
  }),
}))

function offer(overrides: Partial<Parameters<typeof guestRsvpOffer>[0]> = {}) {
  return guestRsvpOffer({
    feeCents: 1500,
    startsAt: '2026-10-15T23:00:00.000Z',
    generalRsvpOpen: true,
    attendanceMax: 45,
    takenSeats: 2,
    now: NOW,
    ...overrides,
  })
}

describe('guest RSVP offer', () => {
  it('opens a paid upcoming event after general RSVP has opened when seats remain', () => {
    expect(offer()).toEqual({
      kind: 'open',
      priceLabel: '$15',
      spotsLeft: null,
    })
    expect(guestRsvpButtonLabel('$15')).toBe('RSVP as a guest for $15')
  })

  it('hides the guest form for free, started, and priority-window events', () => {
    expect(offer({ feeCents: 0 }).kind).toBe('hidden')
    expect(offer({ feeCents: null }).kind).toBe('hidden')
    expect(offer({ startsAt: '2026-10-05T17:00:00.000Z' }).kind).toBe('hidden')
    expect(offer({ generalRsvpOpen: false }).kind).toBe('hidden')
  })

  it('shows Sold out when no seats remain and a count when 10 or fewer are left', () => {
    expect(offer({ attendanceMax: 20, takenSeats: 20 })).toEqual({
      kind: 'sold_out',
    })
    expect(offer({ attendanceMax: 12, takenSeats: 2 })).toMatchObject({
      kind: 'open',
      spotsLeft: 10,
    })
    expect(spotsLeftLabel(10)).toBe('Only 10 spots left.')
    expect(offer({ attendanceMax: 20, takenSeats: 9 })).toMatchObject({
      kind: 'open',
      spotsLeft: null,
    })
    expect(offer({ attendanceMax: null, takenSeats: null })).toMatchObject({
      kind: 'open',
      spotsLeft: null,
    })
    expect(offer({ attendanceMax: 20, takenSeats: null }).kind).toBe('hidden')
  })
})

describe('guest checkout messages', () => {
  it('reads only the success and cancelled return messages', () => {
    expect(guestCheckoutReturnMessage('success')).toBe(
      GUEST_CHECKOUT_MESSAGES.success
    )
    expect(guestCheckoutReturnMessage('cancelled')).toBe(
      GUEST_CHECKOUT_MESSAGES.cancelled
    )
    expect(guestCheckoutReturnMessage('paid')).toBeNull()
    expect(guestCheckoutReturnMessage(undefined)).toBeNull()
  })

  it('calls checkout with the guest fields and redirects on success', async () => {
    const checkout = vi.fn().mockResolvedValue({
      url: 'https://checkout.stripe.com/c/pay/test',
    })

    const result = await beginGuestCheckout(
      {
        eventId: EVENT_ID,
        fullName: '  Ada Lovelace  ',
        email: '  ADA@example.com ',
        rsvpAnswer: '  Chess  ',
        website: '',
        rsvpQuestionRequired: true,
      },
      checkout
    )

    expect(checkout).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      rsvpAnswer: 'Chess',
      website: '',
    })
    expect(result).toEqual({
      type: 'redirect',
      url: 'https://checkout.stripe.com/c/pay/test',
    })
  })

  it.each([
    ['full', GUEST_CHECKOUT_MESSAGES.full],
    ['already_registered', GUEST_CHECKOUT_MESSAGES.already_registered],
    ['rate_limited', GUEST_CHECKOUT_MESSAGES.rate_limited],
    ['not_available', GUEST_CHECKOUT_MESSAGES.not_available],
    ['error', GUEST_CHECKOUT_MESSAGES.error],
  ] as const)('shows the %s message', async (code, message) => {
    const checkout = vi.fn().mockResolvedValue({ error: code })
    const result = await beginGuestCheckout(
      {
        eventId: EVENT_ID,
        fullName: 'Ada Lovelace',
        email: 'ada@example.com',
        rsvpAnswer: '',
        website: '',
        rsvpQuestionRequired: false,
      },
      checkout
    )
    expect(result).toEqual({ type: 'message', message })
  })

  it('shows field errors for invalid input and does not start checkout', async () => {
    const checkout = vi.fn()
    const missing = await beginGuestCheckout(
      {
        eventId: EVENT_ID,
        fullName: ' ',
        email: 'not-an-email',
        rsvpAnswer: '',
        website: '',
        rsvpQuestionRequired: true,
      },
      checkout
    )
    expect(checkout).not.toHaveBeenCalled()
    expect(missing).toEqual({
      type: 'fields',
      errors: {
        fullName: 'Enter your full name.',
        email: 'Enter a valid email.',
        rsvpAnswer: 'Answer this question to continue.',
      },
    })

    const serverInvalid = await beginGuestCheckout(
      {
        eventId: EVENT_ID,
        fullName: 'Ada Lovelace',
        email: 'ada@example.com',
        rsvpAnswer: 'Chess',
        website: 'https://spam.example',
        rsvpQuestionRequired: true,
      },
      vi.fn().mockResolvedValue({ error: 'invalid_input' })
    )
    expect(serverInvalid).toEqual({
      type: 'fields',
      errors: { form: GUEST_CHECKOUT_MESSAGES.invalidInput },
    })
  })
})

describe('public guest listing fields', () => {
  beforeEach(() => {
    listingState.row = null
    listingState.select = ''
  })

  it('returns the question fields only after the event is published and listed', async () => {
    listingState.row = {
      status: 'published',
      listed_publicly: true,
      rsvp_question: " What's your favorite board game? ",
      rsvp_question_required: true,
      general_rsvp_opens_at: '2026-09-28T07:00:00.000Z',
    }

    await expect(loadPublicGuestListingFields(EVENT_ID, NOW)).resolves.toEqual({
      rsvpQuestion: "What's your favorite board game?",
      rsvpQuestionRequired: true,
      generalRsvpOpen: true,
    })
    expect(listingState.select).toBe(
      'status, listed_publicly, rsvp_question, rsvp_question_required, general_rsvp_opens_at'
    )
    expect(listingState.select).not.toContain('owner_id')
    expect(listingState.select).not.toContain('email')
    expect(listingState.select).not.toContain('*')
  })

  it('treats a future general RSVP time as closed and ignores unlisted events', async () => {
    listingState.row = {
      status: 'published',
      listed_publicly: true,
      rsvp_question: null,
      rsvp_question_required: false,
      general_rsvp_opens_at: '2026-10-20T00:00:00.000Z',
    }
    await expect(loadPublicGuestListingFields(EVENT_ID, NOW)).resolves.toMatchObject({
      generalRsvpOpen: false,
    })

    listingState.row = {
      ...listingState.row,
      listed_publicly: false,
      general_rsvp_opens_at: null,
    }
    await expect(loadPublicGuestListingFields(EVENT_ID, NOW)).resolves.toBeNull()
  })
})

describe('guest RSVP form markup', () => {
  const formSource = readFileSync(
    resolve(process.cwd(), 'components/marketing/public-guest-rsvp-form.tsx'),
    'utf8'
  )
  const pageSource = readFileSync(
    resolve(process.cwd(), 'app/(marketing)/public-events/[id]/page.tsx'),
    'utf8'
  )
  const listSource = readFileSync(
    resolve(process.cwd(), 'app/(marketing)/public-events/page.tsx'),
    'utf8'
  )

  it('renders the guest price and spots count without private event fields', () => {
    const html = renderToStaticMarkup(
      createElement(PublicGuestRsvpForm, {
        eventId: EVENT_ID,
        priceLabel: '$15',
        rsvpQuestion: "What's your favorite board game?",
        rsvpQuestionRequired: true,
        spotsLeft: 4,
      })
    )

    expect(html).toContain('RSVP as a guest for $15')
    expect(html).toContain('Only 4 spots left.')
    expect(html).not.toContain('owner_id')
    expect(html).not.toContain('general_rsvp_opens_at')
    expect(html).not.toContain('event_attendees')
    expect(html).not.toContain('@example.com')
  })

  it('keeps a hidden honeypot and sends checkout through the existing action', () => {
    expect(formSource).toContain('name="website"')
    expect(formSource).toContain('tabIndex={-1}')
    expect(formSource).toContain('autoComplete="off"')
    expect(formSource).toContain('aria-hidden="true"')
    expect(formSource).toContain('overflow-hidden')
    expect(formSource).toContain('startGuestEventCheckout')
    expect(formSource).toContain('window.location.assign')
    expect(formSource).toContain('Continue to payment')
    expect(formSource).toContain('disabled={submitting}')
    expect(formSource).toContain(
      "You'll pay securely with Stripe. Members can sign in to use a credit."
    )
    expect(formSource).not.toContain('owner_id')
    expect(formSource).not.toContain('event_attendees')
    expect(pageSource).toContain('memberEventRsvpHref(event.id)')
    expect(pageSource).toContain('Members: sign in to RSVP')
    expect(listSource).not.toContain('PublicGuestRsvpForm')
    expect(listSource).not.toContain('startGuestEventCheckout')
  })
})
