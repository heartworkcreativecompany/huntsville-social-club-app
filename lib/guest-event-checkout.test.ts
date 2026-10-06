import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluateEventRegistration } from '@/lib/membership-entitlements'
import {
  consumeCircleSocialCredit,
  consumeEventCredit,
} from '@/lib/membership-billing-cycles'
import {
  createEventFeeCheckoutSession,
  markEventFeePaidFromCheckout,
} from '@/lib/stripe/event-fee-checkout'

const EVENT_ID = '11111111-1111-4111-8111-111111111111'
const REGISTRATION_ID = '22222222-2222-4222-8222-222222222222'
const EMAIL = 'guest-secret@example.com'
const NAME = 'Secret Guest'
const SESSION_ID = 'cs_test_secret_session'

const { stripeState, adminState } = vi.hoisted(() => ({
  stripeState: {
    configured: true,
    create: vi.fn(),
    customersCreate: vi.fn(),
  },
  adminState: {
    event: null as null | {
      id: string
      title: string | null
      rsvp_question_required: boolean | null
    },
    reserve: { code: 'ok', id: '', amount_cents: 2500 } as Record<string, unknown>,
    reserveError: null as { message: string } | null,
    failSave: false,
    updates: [] as Record<string, unknown>[],
    rpcCalls: [] as { fn: string; args: Record<string, unknown> }[],
    tables: [] as string[],
    seatCount: 0,
  },
}))

vi.mock('@/lib/stripe/config', () => ({
  getStripe: () => ({
    checkout: {
      sessions: {
        create: (...args: unknown[]) => stripeState.create(...args),
      },
    },
    customers: {
      create: (...args: unknown[]) => stripeState.customersCreate(...args),
    },
  }),
  isStripeConfigured: () => stripeState.configured,
  appBaseUrl: () => 'http://localhost:3000',
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      adminState.tables.push(table)
      if (table === 'events') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: adminState.event, error: null }),
            }),
          }),
        }
      }
      if (table === 'guest_event_registrations') {
        return {
          update: (payload: Record<string, unknown>) => ({
            eq: () => ({
              eq: async () => {
                adminState.updates.push(payload)
                if (
                  payload.stripe_checkout_session_id &&
                  adminState.failSave
                ) {
                  return { error: { message: `db failed for ${EMAIL}` } }
                }
                return { error: null }
              },
            }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      adminState.rpcCalls.push({ fn, args })
      if (fn === 'event_taken_seat_count') {
        return { data: adminState.seatCount, error: null }
      }
      if (fn === 'reserve_guest_event_seat') {
        return { data: adminState.reserve, error: adminState.reserveError }
      }
      throw new Error(`unexpected rpc ${fn}`)
    },
  }),
}))

vi.mock('@/lib/membership-entitlements', () => ({
  evaluateEventRegistration: vi.fn(),
}))

vi.mock('@/lib/membership-billing-cycles', () => ({
  consumeEventCredit: vi.fn(),
  consumeCircleSocialCredit: vi.fn(),
}))

vi.mock('@/lib/stripe/event-fee-checkout', () => ({
  createEventFeeCheckoutSession: vi.fn(),
  markEventFeePaidFromCheckout: vi.fn(),
}))

import { loadEventTakenSeatCount } from '@/lib/event-seat-count'
import { startGuestEventCheckout } from '@/lib/guest-event-checkout'

const GUEST_FILES = [
  'lib/guest-event-checkout.ts',
  'lib/guest-event-webhook.ts',
  'lib/guest-event-fee.ts',
]

const FORBIDDEN_MEMBER_CALLS = [
  'requireEntitledViewer',
  'evaluateEventRegistration',
  'consumeEventCredit',
  'consumeCircleSocialCredit',
  'createEventFeeCheckoutSession',
  'markEventFeePaidFromCheckout',
  "from('event_attendees')",
  "from('event_registration_ledger')",
  "from('membership_entitlement_cycles')",
]

function guestInput(overrides: Record<string, unknown> = {}) {
  return {
    eventId: EVENT_ID,
    fullName: NAME,
    email: `  ${EMAIL.toUpperCase()}  `,
    rsvpAnswer: 'Window seat',
    website: '',
    ...overrides,
  }
}

describe('startGuestEventCheckout', () => {
  beforeEach(() => {
    stripeState.configured = true
    stripeState.create.mockReset()
    stripeState.customersCreate.mockReset()
    stripeState.create.mockResolvedValue({
      id: SESSION_ID,
      url: 'https://checkout.stripe.com/c/pay/test-session',
    })
    adminState.event = {
      id: EVENT_ID,
      title: 'Rooftop Social',
      rsvp_question_required: false,
    }
    adminState.reserve = {
      code: 'ok',
      id: REGISTRATION_ID,
      amount_cents: 2500,
    }
    adminState.reserveError = null
    adminState.failSave = false
    adminState.updates = []
    adminState.rpcCalls = []
    adminState.tables = []
    adminState.seatCount = 0
    delete process.env.NEXT_PUBLIC_MARKETING_URL
  })

  it('does nothing when the honeypot is filled', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await startGuestEventCheckout(
      guestInput({ website: 'https://spam.example' })
    )

    expect(result).toEqual({ error: 'error' })
    expect(adminState.rpcCalls).toHaveLength(0)
    expect(stripeState.create).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toContain(EMAIL)
    expect(JSON.stringify(result)).not.toContain(NAME)
    expect(errorSpy).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('rejects invalid names, emails, and long answers', async () => {
    const cases = [
      guestInput({ fullName: '   ' }),
      guestInput({ fullName: 'A'.repeat(121) }),
      guestInput({ email: 'not-an-email' }),
      guestInput({ rsvpAnswer: 'A'.repeat(301) }),
      guestInput({ eventId: 'event-1' }),
    ]

    for (const input of cases) {
      const result = await startGuestEventCheckout(input)
      expect(result).toEqual({ error: 'invalid_input' })
    }

    expect(adminState.rpcCalls).toHaveLength(0)
    expect(stripeState.create).not.toHaveBeenCalled()
  })

  it('requires an answer when the event says the question is required', async () => {
    adminState.event = {
      id: EVENT_ID,
      title: 'Rooftop Social',
      rsvp_question_required: true,
    }

    const missing = await startGuestEventCheckout(guestInput({ rsvpAnswer: '   ' }))
    const present = await startGuestEventCheckout(
      guestInput({ rsvpAnswer: ' Driving ' })
    )

    expect(missing).toEqual({ error: 'invalid_input' })
    expect(present).toEqual({
      url: 'https://checkout.stripe.com/c/pay/test-session',
    })
    expect(adminState.rpcCalls).toHaveLength(1)
    expect(adminState.rpcCalls[0]?.args.p_rsvp_answer).toBe('Driving')
  })

  it.each(['full', 'already_registered', 'not_available', 'rate_limited'] as const)(
    'returns %s from the reservation function without starting checkout',
    async (code) => {
      adminState.reserve = { code }
      const result = await startGuestEventCheckout(guestInput())
      expect(result).toEqual({ error: code })
      expect(stripeState.create).not.toHaveBeenCalled()
      expect(JSON.stringify(result)).not.toContain(EMAIL)
    }
  )

  it('opens Checkout for the reserved amount and stores only the session on the hold', async () => {
    const now = Math.floor(Date.now() / 1000)
    const result = await startGuestEventCheckout(guestInput())

    expect(result).toEqual({
      url: 'https://checkout.stripe.com/c/pay/test-session',
    })
    expect(stripeState.customersCreate).not.toHaveBeenCalled()
    expect(stripeState.create).toHaveBeenCalledTimes(1)

    const [params, options] = stripeState.create.mock.calls[0] as [
      Record<string, unknown>,
      { idempotencyKey?: string },
    ]
    expect(params.mode).toBe('payment')
    expect(params.customer).toBeUndefined()
    expect(params.customer_creation).not.toBe('always')
    expect(params.customer_email).toBe(EMAIL)
    expect(params.expires_at).toBeGreaterThanOrEqual(now + 30 * 60 - 2)
    expect(params.expires_at).toBeLessThanOrEqual(now + 30 * 60 + 2)
    expect(params.success_url).toBe(
      `https://huntsvillesocialclub.com/events/${EVENT_ID}?guest_checkout=success`
    )
    expect(params.cancel_url).toBe(
      `https://huntsvillesocialclub.com/events/${EVENT_ID}?guest_checkout=cancelled`
    )
    expect(params.metadata).toEqual({
      checkout_type: 'guest_event_fee',
      guest_registration_id: REGISTRATION_ID,
      event_id: EVENT_ID,
    })
    expect(params.line_items).toEqual([
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: 2500,
          product_data: { name: 'Rooftop Social' },
        },
      },
    ])
    expect(options.idempotencyKey).toBe(REGISTRATION_ID)
    expect(adminState.rpcCalls[0]).toMatchObject({
      fn: 'reserve_guest_event_seat',
      args: {
        p_event_id: EVENT_ID,
        p_full_name: NAME,
        p_email: EMAIL,
        p_hold_minutes: 30,
      },
    })
    expect(adminState.updates).toContainEqual({
      stripe_checkout_session_id: SESSION_ID,
    })
    expect(JSON.stringify(result)).not.toContain(SESSION_ID)
    expect(JSON.stringify(result)).not.toContain(EMAIL)
    expect(JSON.stringify(result)).not.toContain(NAME)
  })

  it('keeps the public marketing host when the configured marketing URL is local', async () => {
    process.env.NEXT_PUBLIC_MARKETING_URL = 'http://localhost:3000'
    await startGuestEventCheckout(guestInput())
    const [params] = stripeState.create.mock.calls[0] as [Record<string, string>]
    expect(params.success_url).toContain('https://huntsvillesocialclub.com/events/')
    expect(params.cancel_url).toContain('guest_checkout=cancelled')
  })

  it('releases the hold when Stripe fails and does not log the guest or the provider error', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    stripeState.create.mockRejectedValue(
      new Error(`card declined for ${EMAIL} ${SESSION_ID}`)
    )

    const result = await startGuestEventCheckout(guestInput())

    expect(result).toEqual({ error: 'error' })
    expect(adminState.updates).toContainEqual({ status: 'expired' })
    const logged = errorSpy.mock.calls.flat().join(' ')
    expect(logged).not.toContain(EMAIL)
    expect(logged).not.toContain(NAME)
    expect(logged).not.toContain(SESSION_ID)
    expect(logged).not.toContain('card declined')
    errorSpy.mockRestore()
  })

  it('releases the hold when the session id cannot be saved', async () => {
    adminState.failSave = true
    const result = await startGuestEventCheckout(guestInput())
    expect(result).toEqual({ error: 'error' })
    expect(adminState.updates).toContainEqual({ status: 'expired' })
    expect(JSON.stringify(result)).not.toContain(SESSION_ID)
  })

  it('never calls member credit or attendee functions', async () => {
    await startGuestEventCheckout(guestInput())

    expect(evaluateEventRegistration).not.toHaveBeenCalled()
    expect(consumeEventCredit).not.toHaveBeenCalled()
    expect(consumeCircleSocialCredit).not.toHaveBeenCalled()
    expect(createEventFeeCheckoutSession).not.toHaveBeenCalled()
    expect(markEventFeePaidFromCheckout).not.toHaveBeenCalled()

    const source = GUEST_FILES.map((file) =>
      readFileSync(resolve(process.cwd(), file), 'utf8')
    ).join('\n')
    for (const name of FORBIDDEN_MEMBER_CALLS) {
      expect(source).not.toContain(name)
    }
    expect(adminState.tables).not.toContain('event_attendees')
    expect(adminState.tables).not.toContain('event_registration_ledger')
    expect(adminState.tables).not.toContain('membership_entitlement_cycles')
  })

  it('is not imported by a client component or a page', () => {
    const allowed = new Set([
      resolve(process.cwd(), 'lib/guest-event-checkout.ts'),
      resolve(process.cwd(), 'lib/guest-event-checkout.test.ts'),
    ])
    const offenders: string[] = []
    for (const root of ['app', 'components', 'lib']) {
      for (const file of listSources(resolve(process.cwd(), root))) {
        if (allowed.has(file)) continue
        const text = readFileSync(file, 'utf8')
        if (/guest-event-checkout['"]/.test(text)) offenders.push(file)
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('shared seat count', () => {
  beforeEach(() => {
    adminState.rpcCalls = []
    adminState.seatCount = 4
  })

  it('loads taken seats from event_taken_seat_count', async () => {
    await expect(loadEventTakenSeatCount(EVENT_ID)).resolves.toBe(4)
    expect(adminState.rpcCalls).toEqual([
      { fn: 'event_taken_seat_count', args: { p_event_id: EVENT_ID } },
    ])
  })

  it('counts guest holds in the member RSVP and event-fee capacity checks', () => {
    const rsvp = readFileSync(
      resolve(process.cwd(), 'app/(club)/events/rsvp-actions.ts'),
      'utf8'
    )
    const eventFee = readFileSync(
      resolve(process.cwd(), 'lib/stripe/event-fee-checkout.ts'),
      'utf8'
    )
    const migration = readFileSync(
      resolve(
        process.cwd(),
        'supabase/migrations/20261005223000_guest_event_checkout.sql'
      ),
      'utf8'
    )

    expect(rsvp).toContain('loadEventTakenSeatCount')
    expect(rsvp).toContain('evaluateEventRegistration')
    expect(rsvp).toContain('consumeEventCredit')
    expect(eventFee).toContain('loadEventTakenSeatCount')
    expect(eventFee).toContain('createEventFeeCheckoutSession')
    expect(migration).toContain("status = 'going'")
    expect(migration).toContain("payment_status is distinct from 'pending'")
    expect(migration).toContain("status = 'paid'")
    expect(migration).toContain("status = 'pending_payment'")
    expect(migration).toContain('expires_at > now()')

    const rsvpCapacity = rsvp.slice(
      rsvp.indexOf('if (isGoing && !wasGoing)'),
      rsvp.indexOf('const decision = evaluateEventRegistration')
    )
    expect(rsvpCapacity).toContain('loadEventTakenSeatCount')
    expect(rsvpCapacity).not.toContain("eq('status', 'going')")
  })
})

describe('guest seat reservation migration', () => {
  const sql = readFileSync(
    resolve(
      process.cwd(),
      'supabase/migrations/20261005223000_guest_event_checkout.sql'
    ),
    'utf8'
  )

  it('locks the event, expires stale holds, and returns only a small result', () => {
    expect(sql).toContain('for update')
    expect(sql).toContain("status is distinct from 'published'")
    expect(sql).toContain('listed_publicly is not true')
    expect(sql).toContain('starts_at <= now()')
    expect(sql).toContain('fee_cents, 0) <= 0')
    expect(sql).toContain('general_rsvp_opens_at > now()')
    expect(sql).toContain("set status = 'expired'")
    expect(sql).toContain("code', 'already_registered'")
    expect(sql).toContain("code', 'rate_limited'")
    expect(sql).toContain('v_recent >= 5')
    expect(sql).toContain("interval '1 hour'")
    expect(sql).toContain("code', 'full'")
    expect(sql).toContain('attendance_max')
    expect(sql).toContain('make_interval(mins => v_hold)')
    expect(sql).toContain("'amount_cents', v_event.fee_cents")
    expect(sql).toContain('set search_path = public')
  })

  it('can be executed only by service_role and does not write member tables', () => {
    for (const signature of [
      'public.event_taken_seat_count(uuid)',
      'public.reserve_guest_event_seat(uuid, text, text, text, integer)',
    ]) {
      expect(sql).toContain(`revoke all on function ${signature} from public`)
      expect(sql).toContain(`revoke all on function ${signature} from anon`)
      expect(sql).toContain(
        `revoke all on function ${signature} from authenticated`
      )
      expect(sql).toContain(
        `grant execute on function ${signature} to service_role`
      )
    }

    for (const table of [
      'event_attendees',
      'event_registration_ledger',
      'membership_entitlement_cycles',
    ]) {
      expect(sql).not.toMatch(
        new RegExp(
          `(insert\\s+into|update|delete\\s+from|alter\\s+table)\\s+(public\\.)?${table}\\b`,
          'i'
        )
      )
    }
  })
})

function listSources(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') {
      continue
    }
    const full = join(dir, entry.name)
    if (entry.isDirectory()) listSources(full, acc)
    else if (/\.(ts|tsx)$/.test(entry.name)) acc.push(full)
  }
  return acc
}
