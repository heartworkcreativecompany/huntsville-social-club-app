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
  existing: null as null | {
    status: string
    payment_status: string | null
    rsvp_answer?: string | null
  },
  goingCount: 0,
  attendanceMax: null as number | null,
  pendingAnswer: null as string | null,
  pendingDeletes: 0,
  writeError: null as { message: string } | null,
  missingAnswerColumn: false,
  zeroRows: false,
  updates: [] as unknown[],
  inserts: [] as unknown[],
  ledger: [] as unknown[],
}

function attendeeWriteResult(payload: Record<string, unknown>) {
  if (
    upsertState.missingAnswerColumn &&
    Object.prototype.hasOwnProperty.call(payload, 'rsvp_answer')
  ) {
    return {
      error: {
        message: 'column rsvp_answer does not exist',
        code: '42703',
      },
      data: null,
    }
  }
  if (upsertState.writeError) {
    return { error: upsertState.writeError, data: null }
  }
  if (upsertState.zeroRows) {
    return { error: null, data: [] as { rsvp_answer: string | null }[] }
  }
  const rsvp_answer = Object.prototype.hasOwnProperty.call(payload, 'rsvp_answer')
    ? (payload.rsvp_answer as string | null | undefined) ?? null
    : upsertState.existing?.rsvp_answer ?? null
  return {
    error: null,
    data: [{ rsvp_answer }],
  }
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'event_rsvp_pending_answers') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: upsertState.pendingAnswer
                    ? { rsvp_answer: upsertState.pendingAnswer }
                    : null,
                  error: null,
                }),
              }),
            }),
          }),
          delete: () => ({
            eq: () => ({
              eq: async () => {
                upsertState.pendingDeletes += 1
                upsertState.pendingAnswer = null
                return { error: null }
              },
            }),
          }),
        }
      }
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
          update: (payload: Record<string, unknown>) => ({
            eq: () => ({
              eq: () => ({
                select: async () => {
                  upsertState.updates.push(payload)
                  return attendeeWriteResult(payload)
                },
              }),
            }),
          }),
          insert: (payload: Record<string, unknown>) => ({
            select: async () => {
              upsertState.inserts.push(payload)
              return attendeeWriteResult(payload)
            },
          }),
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
    upsertState.pendingAnswer = null
    upsertState.pendingDeletes = 0
    upsertState.writeError = null
    upsertState.missingAnswerColumn = false
    upsertState.zeroRows = false
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
    expect(upsertState.inserts[0]).not.toHaveProperty('rsvp_answer')
    expect(upsertState.ledger[0]).toMatchObject({
      action: 'payment_complete',
      event_id: 'evt_1',
      user_id: 'user_1',
    })
    expect(JSON.stringify(upsertState.ledger[0])).not.toContain('rsvp_answer')
  })

  it('attaches a previously saved pending answer on first paid confirmation', async () => {
    upsertState.pendingAnswer = 'Driving'

    const result = await markEventFeePaidFromCheckout({
      id: 'cs_test',
      metadata: {
        type: 'event_fee',
        event_id: 'evt_1',
        user_id: 'user_1',
        fee_cents: '2500',
      },
      payment_status: 'paid',
    })

    expect(result).toEqual({ ok: true })
    expect(upsertState.inserts[0]).toMatchObject({
      status: 'going',
      payment_status: 'paid',
      rsvp_answer: 'Driving',
    })
    expect(upsertState.pendingDeletes).toBe(1)
    expect(upsertState.pendingAnswer).toBeNull()
  })

  it('is idempotent on webhook retry and does not duplicate the attendee or answer', async () => {
    upsertState.existing = {
      status: 'going',
      payment_status: 'paid',
      rsvp_answer: 'Driving',
    }
    upsertState.pendingAnswer = 'Driving'

    const first = await markEventFeePaidFromCheckout({
      id: 'cs_test',
      metadata: {
        type: 'event_fee',
        event_id: 'evt_1',
        user_id: 'user_1',
      },
      payment_status: 'paid',
    })
    const second = await markEventFeePaidFromCheckout({
      id: 'cs_test',
      metadata: {
        type: 'event_fee',
        event_id: 'evt_1',
        user_id: 'user_1',
      },
      payment_status: 'paid',
    })

    expect(first).toEqual({ ok: true })
    expect(second).toEqual({ ok: true })
    expect(upsertState.inserts).toHaveLength(0)
    expect(upsertState.updates).toHaveLength(0)
    expect(upsertState.ledger).toHaveLength(0)
    expect(upsertState.pendingDeletes).toBe(1)
  })

  it('attaches a leftover pending answer when Going is already paid without one', async () => {
    upsertState.existing = {
      status: 'going',
      payment_status: 'paid',
      rsvp_answer: null,
    }
    upsertState.pendingAnswer = 'Window seat'

    const result = await markEventFeePaidFromCheckout({
      id: 'cs_retry',
      metadata: {
        type: 'event_fee',
        event_id: 'evt_1',
        user_id: 'user_1',
      },
      payment_status: 'paid',
    })

    expect(result).toEqual({ ok: true })
    expect(upsertState.updates).toEqual([{ rsvp_answer: 'Window seat' }])
    expect(upsertState.inserts).toHaveLength(0)
    expect(upsertState.pendingDeletes).toBe(1)
  })

  it('preserves a prior Maybe row by updating it to Going after payment', async () => {
    upsertState.existing = {
      status: 'maybe',
      payment_status: null,
      rsvp_answer: null,
    }
    upsertState.pendingAnswer = 'Driving'

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
    expect(upsertState.updates[0]).toMatchObject({
      status: 'going',
      payment_status: 'paid',
      rsvp_answer: 'Driving',
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

  it('does not overwrite a nonblank attendee answer during paid confirmation', async () => {
    upsertState.existing = {
      status: 'maybe',
      payment_status: null,
      rsvp_answer: 'Train',
    }
    upsertState.pendingAnswer = 'Driving'

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
    expect(upsertState.updates[0]).toMatchObject({
      status: 'going',
      payment_status: 'paid',
    })
    expect(upsertState.updates[0]).not.toHaveProperty('rsvp_answer')
    expect(upsertState.pendingDeletes).toBe(1)
    expect(upsertState.pendingAnswer).toBeNull()
  })

  it('does not overwrite a nonblank answer on the already-paid retry path', async () => {
    upsertState.existing = {
      status: 'going',
      payment_status: 'paid',
      rsvp_answer: 'Train',
    }
    upsertState.pendingAnswer = 'Driving'

    const result = await markEventFeePaidFromCheckout({
      id: 'cs_retry',
      metadata: {
        type: 'event_fee',
        event_id: 'evt_1',
        user_id: 'user_1',
      },
      payment_status: 'paid',
    })

    expect(result).toEqual({ ok: true })
    expect(upsertState.updates).toHaveLength(0)
    expect(upsertState.inserts).toHaveLength(0)
    expect(upsertState.pendingDeletes).toBe(1)
  })

  it('keeps pending when the Going answer write fails', async () => {
    upsertState.pendingAnswer = 'Driving'
    upsertState.writeError = { message: 'write failed' }

    const result = await markEventFeePaidFromCheckout({
      id: 'cs_test',
      metadata: {
        type: 'event_fee',
        event_id: 'evt_1',
        user_id: 'user_1',
      },
      payment_status: 'paid',
    })

    expect(result).toEqual({ error: 'write failed' })
    expect(upsertState.pendingDeletes).toBe(0)
    expect(upsertState.pendingAnswer).toBe('Driving')
    expect(upsertState.ledger).toHaveLength(0)
  })

  it('keeps pending when a missing-column fallback omits rsvp_answer', async () => {
    upsertState.pendingAnswer = 'Driving'
    upsertState.missingAnswerColumn = true

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
    expect(upsertState.inserts).toHaveLength(2)
    expect(upsertState.inserts[0]).toMatchObject({ rsvp_answer: 'Driving' })
    expect(upsertState.inserts[1]).not.toHaveProperty('rsvp_answer')
    expect(upsertState.pendingDeletes).toBe(0)
    expect(upsertState.pendingAnswer).toBe('Driving')
  })

  it('keeps pending when the attendee update matches zero rows', async () => {
    upsertState.existing = {
      status: 'maybe',
      payment_status: null,
      rsvp_answer: null,
    }
    upsertState.pendingAnswer = 'Driving'
    upsertState.zeroRows = true

    const result = await markEventFeePaidFromCheckout({
      id: 'cs_test',
      metadata: {
        type: 'event_fee',
        event_id: 'evt_1',
        user_id: 'user_1',
      },
      payment_status: 'paid',
    })

    expect(result).toEqual({ error: 'Could not save event registration.' })
    expect(upsertState.pendingDeletes).toBe(0)
    expect(upsertState.pendingAnswer).toBe('Driving')
    expect(upsertState.ledger).toHaveLength(0)
  })

  it('keeps pending when already-paid attach fails to write the answer', async () => {
    upsertState.existing = {
      status: 'going',
      payment_status: 'paid',
      rsvp_answer: null,
    }
    upsertState.pendingAnswer = 'Driving'
    upsertState.writeError = { message: 'write failed' }

    const result = await markEventFeePaidFromCheckout({
      id: 'cs_retry',
      metadata: {
        type: 'event_fee',
        event_id: 'evt_1',
        user_id: 'user_1',
      },
      payment_status: 'paid',
    })

    expect(result).toEqual({ ok: true })
    expect(upsertState.pendingDeletes).toBe(0)
    expect(upsertState.pendingAnswer).toBe('Driving')
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
