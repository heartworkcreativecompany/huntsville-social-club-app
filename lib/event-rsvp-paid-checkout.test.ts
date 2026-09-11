import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
  RSVP_ANSWER_REQUIRED_MESSAGE,
  RSVP_ANSWER_SAVE_FAILED_MESSAGE,
  goingRsvpAnswerRejection,
  paidCheckoutPendingAnswerPlan,
  rsvpAnswerWriteFields,
} from '@/lib/event-rsvp-question'
import {
  persistPaidCheckoutPendingAnswer,
} from '@/lib/event-rsvp-pending-answer'
import {
  paidCheckoutAttendeeWrite,
  startPaidGoingAfterPersistingAnswer,
} from '@/lib/event-rsvp-paid-checkout'

function keyFor(eventId: string, userId: string) {
  return `${eventId}:${userId}`
}

function createPendingClient(state: {
  rows: Map<string, { rsvp_answer: string }>
  upsertError?: { message: string } | null
  deleteError?: { message: string } | null
  upsertCalls: number
  deleteCalls: number
}) {
  return {
    from: (table: string) => {
      if (table !== 'event_rsvp_pending_answers') {
        throw new Error(`unexpected table ${table}`)
      }
      return {
        upsert: async (
          row: { event_id: string; user_id: string; rsvp_answer: string },
          _opts?: { onConflict: string }
        ) => {
          state.upsertCalls += 1
          if (state.upsertError) return { error: state.upsertError }
          state.rows.set(keyFor(row.event_id, row.user_id), {
            rsvp_answer: row.rsvp_answer,
          })
          return { error: null }
        },
        delete: () => ({
          eq: (_col: string, eventId: string) => ({
            eq: async (_userCol: string, userId: string) => {
              state.deleteCalls += 1
              if (state.deleteError) return { error: state.deleteError }
              state.rows.delete(keyFor(eventId, userId))
              return { error: null }
            },
          }),
        }),
        select: () => ({
          eq: (_col: string, eventId: string) => ({
            eq: (_userCol: string, userId: string) => ({
              maybeSingle: async () => {
                const row = state.rows.get(keyFor(eventId, userId))
                return { data: row ?? null, error: null }
              },
            }),
          }),
        }),
      }
    },
  } as unknown as SupabaseClient<Database>
}

describe('paidCheckoutPendingAnswerPlan', () => {
  it('skips persistence when the event has no Going answer field', () => {
    expect(paidCheckoutPendingAnswerPlan({})).toEqual({ action: 'skip' })
    expect(
      paidCheckoutPendingAnswerPlan({ error: 'Your answer is required to RSVP.' })
    ).toEqual({ action: 'skip' })
  })

  it('upserts a trimmed nonblank Going answer and clears an empty optional answer', () => {
    expect(
      paidCheckoutPendingAnswerPlan({ rsvp_answer: 'Driving' })
    ).toEqual({ action: 'upsert', rsvp_answer: 'Driving' })
    expect(paidCheckoutPendingAnswerPlan({ rsvp_answer: null })).toEqual({
      action: 'clear',
    })
  })
})

describe('startPaidGoingAfterPersistingAnswer', () => {
  it('starts Checkout when there is no event question', async () => {
    const createCheckout = vi.fn(async () => ({
      url: 'https://checkout.example/session',
      sessionId: 'cs_1',
    }))
    const persistPending = vi.fn(async () => ({ ok: true as const }))

    const result = await startPaidGoingAfterPersistingAnswer({
      persistPending,
      createCheckout,
    })

    expect(result).toEqual({
      url: 'https://checkout.example/session',
      sessionId: 'cs_1',
    })
    expect(persistPending).toHaveBeenCalledTimes(1)
    expect(createCheckout).toHaveBeenCalledTimes(1)
  })

  it('blocks Checkout before Stripe when a required answer is missing', () => {
    const rejection = goingRsvpAnswerRejection({
      status: 'going',
      question: 'How will you arrive?',
      required: true,
      answer: '   ',
    })
    expect(rejection).toBe(RSVP_ANSWER_REQUIRED_MESSAGE)
  })

  it('does not create Checkout when pending answer persistence fails', async () => {
    const createCheckout = vi.fn(async () => ({
      url: 'https://checkout.example/session',
      sessionId: 'cs_1',
    }))

    const result = await startPaidGoingAfterPersistingAnswer({
      persistPending: async () => ({ error: RSVP_ANSWER_SAVE_FAILED_MESSAGE }),
      createCheckout,
    })

    expect(result).toEqual({ error: RSVP_ANSWER_SAVE_FAILED_MESSAGE })
    expect(createCheckout).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toContain('event_rsvp_pending_answers')
    expect(JSON.stringify(result)).not.toContain('Driving')
  })
})

describe('persistPaidCheckoutPendingAnswer', () => {
  it('upserts insert and update paths for the member’s own pending answer', async () => {
    const state = {
      rows: new Map<string, { rsvp_answer: string }>(),
      upsertCalls: 0,
      deleteCalls: 0,
    }
    const supabase = createPendingClient(state)

    const first = await persistPaidCheckoutPendingAnswer(supabase, {
      eventId: 'evt_1',
      userId: 'user_1',
      plan: { action: 'upsert', rsvp_answer: 'Driving' },
    })
    const second = await persistPaidCheckoutPendingAnswer(supabase, {
      eventId: 'evt_1',
      userId: 'user_1',
      plan: { action: 'upsert', rsvp_answer: 'Rideshare' },
    })

    expect(first).toEqual({ ok: true })
    expect(second).toEqual({ ok: true })
    expect(state.upsertCalls).toBe(2)
    expect(state.rows.get('evt_1:user_1')).toEqual({ rsvp_answer: 'Rideshare' })
  })

  it('returns a safe error and does not leak the answer when upsert fails', async () => {
    const state = {
      rows: new Map<string, { rsvp_answer: string }>(),
      upsertError: { message: 'insert into event_rsvp_pending_answers failed' },
      upsertCalls: 0,
      deleteCalls: 0,
    }
    const result = await persistPaidCheckoutPendingAnswer(
      createPendingClient(state),
      {
        eventId: 'evt_1',
        userId: 'user_1',
        plan: { action: 'upsert', rsvp_answer: 'Secret answer' },
      }
    )

    expect(result).toEqual({ error: RSVP_ANSWER_SAVE_FAILED_MESSAGE })
    expect(JSON.stringify(result)).not.toContain('Secret answer')
    expect(JSON.stringify(result)).not.toContain('event_rsvp_pending_answers')
    expect(state.rows.size).toBe(0)
  })

  it('does not persist a pending row when Going has no answer to store', async () => {
    const state = {
      rows: new Map<string, { rsvp_answer: string }>(),
      upsertCalls: 0,
      deleteCalls: 0,
    }
    const answerWrite = rsvpAnswerWriteFields({ status: 'going', answer: '' })
    const result = await persistPaidCheckoutPendingAnswer(
      createPendingClient(state),
      {
        eventId: 'evt_1',
        userId: 'user_1',
        plan: paidCheckoutPendingAnswerPlan(answerWrite),
      }
    )

    expect(result).toEqual({ ok: true })
    expect(state.upsertCalls).toBe(0)
    expect(state.deleteCalls).toBe(1)
  })
})

describe('paidCheckoutAttendeeWrite', () => {
  it('does not create a not_going placeholder when the member has no attendee row', () => {
    expect(
      paidCheckoutAttendeeWrite({
        hasUnpaidGoingPlaceholder: false,
        hasExistingAttendeeRow: false,
      })
    ).toBeNull()
  })

  it('preserves an existing Maybe or Not going row during checkout', () => {
    expect(
      paidCheckoutAttendeeWrite({
        hasUnpaidGoingPlaceholder: false,
        hasExistingAttendeeRow: true,
      })
    ).toBeNull()
  })

  it('only clears a legacy unpaid Going placeholder on an existing row', () => {
    expect(
      paidCheckoutAttendeeWrite({
        hasUnpaidGoingPlaceholder: true,
        hasExistingAttendeeRow: true,
      })
    ).toBe('clear_unpaid_going_placeholder')
  })
})
