import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'

const REGISTRATION_ID = '8a5f2adc-eeee-41ef-be7d-a17ea4ff7613'
const EVENT_ID = '72df581f-d761-4f24-a583-95b6f1e0c63c'
const SESSION_ID = 'cs_test_secret_session'
const PAYMENT_INTENT_ID = 'pi_test_secret_intent'
const EMAIL = 'guest-secret@example.com'
const STRIPE_EVENT_ID = 'evt_test_secret'

type Row = {
  id: string
  status: string
  stripe_checkout_session_id: string | null
  paid_at: string | null
  stripe_payment_intent_id: string | null
}

vi.mock('server-only', () => ({}))

const harness = vi.hoisted(() => ({
  duplicate: false,
  mark: vi.fn(async () => {}),
  rows: [] as Row[],
  event: {} as Stripe.Event,
}))

vi.mock('@/lib/stripe/config', () => ({
  getStripe: () => ({}),
  appBaseUrl: () => 'https://example.com',
}))

vi.mock('@/lib/stripe/verify-webhook-signature', () => ({
  constructVerifiedStripeEvent: () => harness.event,
}))

vi.mock('@/lib/stripe/webhook-idempotency', () => ({
  hasProcessedStripeEvent: async () => harness.duplicate,
  markStripeEventProcessed: (...args: unknown[]) => harness.mark(...args),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table !== 'guest_event_registrations') {
        throw new Error(`unexpected table ${table}`)
      }
      return {
        select() {
          return {
            eq(column: string, value: string) {
              return {
                eq(column2: string, value2: string) {
                  return {
                    async maybeSingle() {
                      const row = harness.rows.find(
                        (item) =>
                          column === 'id' &&
                          item.id === value &&
                          column2 === 'stripe_checkout_session_id' &&
                          item.stripe_checkout_session_id === value2
                      )
                      return {
                        data: row ? { id: row.id, status: row.status } : null,
                        error: null,
                      }
                    },
                  }
                },
              }
            },
          }
        },
        update(payload: Record<string, unknown>) {
          return {
            eq(_column: string, id: string) {
              return {
                async in(_statusColumn: string, statuses: string[]) {
                  const row = harness.rows.find((item) => item.id === id)
                  if (row && statuses.includes(row.status)) {
                    Object.assign(row, payload)
                    return { error: null, count: 1 }
                  }
                  return { error: null, count: 0 }
                },
              }
            },
          }
        },
      }
    },
  }),
}))

import { POST } from '@/app/api/stripe/webhook/route'

function guestEvent(
  overrides: Partial<Stripe.Checkout.Session> = {}
): Stripe.Event {
  return {
    id: STRIPE_EVENT_ID,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: SESSION_ID,
        mode: 'payment',
        status: 'complete',
        payment_status: 'paid',
        payment_intent: PAYMENT_INTENT_ID,
        metadata: {
          checkout_type: 'guest_event_fee',
          guest_registration_id: REGISTRATION_ID,
          event_id: EVENT_ID,
        },
        ...overrides,
      },
    },
  } as Stripe.Event
}

async function postWebhook() {
  return POST(
    new Request('https://example.com/api/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': 't=1,v1=test' },
      body: '{}',
    })
  )
}

describe('guest checkout webhook route', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = 'test-webhook-secret'
    harness.duplicate = false
    harness.mark.mockClear()
    harness.rows.splice(0, harness.rows.length, {
      id: REGISTRATION_ID,
      status: 'pending_payment',
      stripe_checkout_session_id: SESSION_ID,
      paid_at: null,
      stripe_payment_intent_id: null,
    })
    harness.event = guestEvent()
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('marks a paid guest session and records the event once', async () => {
    const response = await postWebhook()

    expect(response.status).toBe(200)
    expect(harness.rows[0]).toMatchObject({
      status: 'paid',
      stripe_payment_intent_id: PAYMENT_INTENT_ID,
    })
    expect(harness.rows[0]?.paid_at).toEqual(expect.any(String))
    expect(harness.mark).toHaveBeenCalledTimes(1)

    const paidAt = harness.rows[0]?.paid_at
    harness.duplicate = true
    const duplicate = await postWebhook()
    expect(duplicate.status).toBe(200)
    expect(await duplicate.json()).toMatchObject({ duplicate: true })
    expect(harness.mark).toHaveBeenCalledTimes(1)
    expect(harness.rows[0]?.paid_at).toBe(paidAt)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('does not record a paid guest session when the stored checkout does not match', async () => {
    harness.rows[0]!.stripe_checkout_session_id = 'cs_other'

    const response = await postWebhook()
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(harness.mark).not.toHaveBeenCalled()
    expect(harness.rows[0]?.status).toBe('pending_payment')
    expect(harness.rows[0]?.stripe_payment_intent_id).toBeNull()
    const logged = [...warnSpy.mock.calls, ...errorSpy.mock.calls].flat().join(' ')
    expect(logged).toContain(REGISTRATION_ID)
    expect(logged).toContain('registration_not_found')
    expect(logged).not.toContain(SESSION_ID)
    expect(logged).not.toContain(PAYMENT_INTENT_ID)
    expect(logged).not.toContain(EMAIL)
    expect(logged).not.toContain(STRIPE_EVENT_ID)
    expect(JSON.stringify(body)).not.toContain(SESSION_ID)
    expect(JSON.stringify(body)).not.toContain(PAYMENT_INTENT_ID)
  })

  it('does not record an unpaid guest session', async () => {
    harness.event = guestEvent({ payment_status: 'unpaid' })

    const response = await postWebhook()

    expect(response.status).toBe(500)
    expect(harness.mark).not.toHaveBeenCalled()
    expect(harness.rows[0]?.status).toBe('pending_payment')
  })
})
