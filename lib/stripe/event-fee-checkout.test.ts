import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  EVENT_FEE_CHECKOUT_TYPE,
  buildEventFeeCheckoutSessionParams,
  isEventFeeCheckoutSession,
  markEventFeePaidFromCheckout,
} from '@/lib/stripe/event-fee-checkout'

vi.mock('@/lib/stripe/config', () => ({
  appBaseUrl: () => 'https://app.example.com',
  getStripe: () => ({}),
  isStripeConfigured: () => true,
}))

const upsertState = {
  existing: null as null | { status: string; payment_status: string | null },
  goingCount: 0,
  attendanceMax: null as number | null,
  updates: [] as unknown[],
  inserts: [] as unknown[],
  ledger: [] as unknown[],
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'event_attendees') {
        return {
          select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
            if (opts?.head) {
              return {
                eq: () => ({
                  eq: async () => ({
                    count: upsertState.goingCount,
                    error: null,
                  }),
                }),
              }
            }
            return {
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: upsertState.existing }),
                }),
              }),
            }
          },
          update: (payload: unknown) => ({
            eq: () => ({
              eq: async () => {
                upsertState.updates.push(payload)
                return { error: null }
              },
            }),
          }),
          insert: async (payload: unknown) => {
            upsertState.inserts.push(payload)
            return { error: null }
          },
        }
      }
      if (table === 'events') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { attendance_max: upsertState.attendanceMax },
              }),
            }),
          }),
        }
      }
      if (table === 'event_registration_ledger') {
        return {
          insert: async (payload: unknown) => {
            upsertState.ledger.push(payload)
            return { error: null }
          },
        }
      }
      return {}
    },
  }),
}))

describe('buildEventFeeCheckoutSessionParams', () => {
  it('builds price_data Checkout with the event fee and event_fee metadata', () => {
    const params = buildEventFeeCheckoutSessionParams({
      eventId: 'evt_1',
      eventTitle: 'Rooftop Social',
      feeCents: 2500,
      userId: 'user_1',
      customerId: 'cus_1',
    })

    expect(params.mode).toBe('payment')
    expect(params.customer).toBe('cus_1')
    expect(params.success_url).toBe(
      'https://app.example.com/events/evt_1?checkout=success'
    )
    expect(params.cancel_url).toBe(
      'https://app.example.com/events/evt_1?checkout=cancel'
    )
    expect(params.line_items).toEqual([
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: 2500,
          product_data: {
            name: 'Rooftop Social',
            description: 'Event registration fee',
          },
        },
      },
    ])
    expect(params.metadata).toMatchObject({
      checkout_type: EVENT_FEE_CHECKOUT_TYPE,
      type: EVENT_FEE_CHECKOUT_TYPE,
      event_id: 'evt_1',
      user_id: 'user_1',
      member_id: 'user_1',
      fee_cents: '2500',
    })
  })

  it('uses the fee amount for each event', () => {
    const a = buildEventFeeCheckoutSessionParams({
      eventId: 'a',
      eventTitle: 'A',
      feeCents: 1500,
      userId: 'u',
      customerId: 'cus',
    })
    const b = buildEventFeeCheckoutSessionParams({
      eventId: 'b',
      eventTitle: 'B',
      feeCents: 4500,
      userId: 'u',
      customerId: 'cus',
    })

    expect(
      (a.line_items?.[0] as { price_data: { unit_amount: number } }).price_data
        .unit_amount
    ).toBe(1500)
    expect(
      (b.line_items?.[0] as { price_data: { unit_amount: number } }).price_data
        .unit_amount
    ).toBe(4500)
  })
})

describe('isEventFeeCheckoutSession', () => {
  it('detects type or checkout_type event_fee payment sessions', () => {
    expect(
      isEventFeeCheckoutSession({
        mode: 'payment',
        metadata: { type: 'event_fee' },
      })
    ).toBe(true)
    expect(
      isEventFeeCheckoutSession({
        mode: 'payment',
        metadata: { checkout_type: 'event_fee' },
      })
    ).toBe(true)
    expect(
      isEventFeeCheckoutSession({
        mode: 'payment',
        metadata: { checkout_type: 'event_sponsorship' },
      })
    ).toBe(false)
    expect(
      isEventFeeCheckoutSession({
        mode: 'subscription',
        metadata: { type: 'event_fee' },
      })
    ).toBe(false)
  })
})

describe('markEventFeePaidFromCheckout', () => {
  beforeEach(() => {
    upsertState.existing = null
    upsertState.goingCount = 0
    upsertState.attendanceMax = null
    upsertState.updates = []
    upsertState.inserts = []
    upsertState.ledger = []
  })

  it('marks RSVP Going only after a paid event_fee checkout session', async () => {
    const result = await markEventFeePaidFromCheckout({
      id: 'cs_test',
      metadata: {
        type: 'event_fee',
        checkout_type: 'event_fee',
        event_id: 'evt_1',
        user_id: 'user_1',
        member_id: 'user_1',
        fee_cents: '2500',
      },
      payment_intent: 'pi_test',
      payment_status: 'paid',
    })

    expect(result).toEqual({ ok: true })
    expect(upsertState.inserts).toHaveLength(1)
    expect(upsertState.inserts[0]).toMatchObject({
      event_id: 'evt_1',
      user_id: 'user_1',
      status: 'going',
      registration_method: 'paid_per_event',
      payment_status: 'paid',
    })
    expect(upsertState.ledger[0]).toMatchObject({
      action: 'payment_complete',
      event_id: 'evt_1',
      user_id: 'user_1',
    })
  })

  it('is a no-op when the member is already Going and paid', async () => {
    upsertState.existing = { status: 'going', payment_status: 'paid' }

    const result = await markEventFeePaidFromCheckout({
      id: 'cs_test',
      metadata: {
        type: 'event_fee',
        event_id: 'evt_1',
        user_id: 'user_1',
      },
      payment_status: 'paid',
    })

    expect(result).toEqual({ ok: true })
    expect(upsertState.inserts).toHaveLength(0)
    expect(upsertState.updates).toHaveLength(0)
    expect(upsertState.ledger).toHaveLength(0)
  })

  it('rejects unpaid sessions', async () => {
    const result = await markEventFeePaidFromCheckout({
      id: 'cs_test',
      metadata: {
        type: 'event_fee',
        event_id: 'evt_1',
        user_id: 'user_1',
      },
      payment_status: 'unpaid',
    })

    expect(result).toEqual({ error: 'Checkout session is not paid.' })
    expect(upsertState.inserts).toHaveLength(0)
  })
})
