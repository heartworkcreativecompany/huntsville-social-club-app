import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import type { Database } from '@/lib/database.types'
import {
  type AdmissionRow,
  type AdmissionSource,
  claimEventTicketEmail,
  commitEventAdmission,
  finishEventTicketEmail,
  type TicketEmailRow,
} from '@/lib/event-ticket-admission'
import { applyGuestCheckoutSessionCompleted } from '@/lib/guest-event-webhook'
import { markEventFeePaidFromCheckout } from '@/lib/stripe/event-fee-checkout'

const NOW = '2026-11-06T18:00:00.000Z'
const MEMBER_EVENT_ID = '11111111-1111-4111-8111-111111111111'
const MEMBER_USER_ID = '22222222-2222-4222-8222-222222222222'
const GUEST_EVENT_ID = '33333333-3333-4333-8333-333333333333'
const GUEST_REGISTRATION_ID = '44444444-4444-4444-8444-444444444444'

const harness = vi.hoisted(() => ({
  admin: null as SupabaseClient<Database> | null,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => harness.admin,
}))

vi.mock('@/lib/stripe/config', () => ({
  appBaseUrl: () => 'https://app.example.com',
  getStripe: () => ({}),
  isStripeConfigured: () => true,
}))

function paidRegistration(overrides: Partial<AdmissionRow> = {}): AdmissionRow {
  return {
    id: 'attendee-1',
    kind: 'event_attendee',
    eventId: MEMBER_EVENT_ID,
    userId: MEMBER_USER_ID,
    status: 'going',
    paymentStatus: 'paid',
    confirmationCode: null,
    confirmedAt: null,
    admissionSource: null,
    amountPaidCents: null,
    amountCents: null,
    ...overrides,
  }
}

function createReplayAdmin(initial: AdmissionRow) {
  let current = initial
  let outbox: TicketEmailRow | null = null
  let codes = 0
  let tokens = 0

  const admin = {
    async rpc(fn: string, args: Record<string, unknown>) {
      if (fn === 'confirm_event_admission') {
        const next = commitEventAdmission(
          current,
          outbox,
          {
            registrationKind: args.p_registration_kind as AdmissionRow['kind'],
            eventId: String(args.p_event_id),
            userId: typeof args.p_user_id === 'string' ? args.p_user_id : null,
            registrationId:
              typeof args.p_registration_id === 'string' ? args.p_registration_id : null,
            admissionSource: args.p_admission_source as AdmissionSource,
            amountPaidCents:
              typeof args.p_amount_paid_cents === 'number' ? args.p_amount_paid_cents : null,
            paymentStatus:
              typeof args.p_payment_status === 'string' ? args.p_payment_status : null,
            creditsRemaining:
              typeof args.p_credits_remaining === 'number' ? args.p_credits_remaining : null,
          },
          {
            now: NOW,
            allocateCode: () => {
              codes += 1
              return codes === 1 ? 'AB23CD45' : 'ZZ99YY88'
            },
            allocateOutboxId: () => 'outbox-1',
          }
        )
        current = next.registration
        outbox = next.outbox
        return { data: next.result, error: null }
      }

      if (fn === 'claim_event_ticket_email') {
        if (!outbox || outbox.id !== args.p_id) return { data: { row: null }, error: null }
        const claimed = claimEventTicketEmail(outbox, NOW, Number(args.p_lease_seconds), () => {
          tokens += 1
          return `token-${tokens}`
        })
        outbox = claimed.outbox
        return {
          data: {
            row: claimed.claimed
              ? {
                  claim_token: outbox.claimToken,
                  registration_kind: outbox.registrationKind,
                }
              : null,
          },
          error: null,
        }
      }

      if (fn === 'load_event_ticket_email_context') {
        if (!outbox || outbox.claimToken !== args.p_claim_token || outbox.status !== 'processing') {
          return { data: { context: null }, error: null }
        }
        return {
          data: {
            context: {
              to: current.kind === 'guest_event_registration' ? 'guest@example.com' : 'ada@example.com',
              attendee_name: current.kind === 'guest_event_registration' ? 'Guest' : 'Ada Lovelace',
              event_name: 'Rooftop Social',
              starts_at: '2026-10-15T23:00:00.000Z',
              ends_at: null,
              venue: 'Lipz Lounge',
              confirmation_code: current.confirmationCode,
              admission_source: current.admissionSource,
              amount_paid_cents: current.amountPaidCents,
              credits_remaining: outbox.creditsRemaining,
            },
          },
          error: null,
        }
      }

      if (fn === 'finish_event_ticket_email') {
        if (!outbox) return { data: { ok: false }, error: null }
        const finished = finishEventTicketEmail(outbox, {
          claimToken: String(args.p_claim_token),
          succeeded: args.p_succeeded === true,
          resendMessageId:
            typeof args.p_resend_message_id === 'string' ? args.p_resend_message_id : null,
          lastError: typeof args.p_last_error === 'string' ? args.p_last_error : null,
          now: NOW,
        })
        if (finished.ok) outbox = finished.outbox
        return { data: { ok: finished.ok }, error: null }
      }

      return { data: null, error: { message: 'unexpected rpc' } }
    },
    from(table: string) {
      const chain = {
        select() {
          return chain
        },
        eq() {
          return chain
        },
        async maybeSingle() {
          if (table === 'event_rsvp_pending_answers') {
            return { data: null, error: null }
          }
          if (table === 'event_attendees') {
            return {
              data: {
                status: 'going',
                payment_status: 'paid',
                rsvp_answer: null,
              },
              error: null,
            }
          }
          if (table === 'guest_event_registrations') {
            return {
              data: { id: current.id, status: 'paid' },
              error: null,
            }
          }
          throw new Error(`unexpected table ${table}`)
        },
      }
      return chain
    },
  }

  return {
    admin: admin as unknown as SupabaseClient<Database>,
    snapshot: () => ({ registration: current, outbox, codes }),
  }
}

let fetchMock: ReturnType<typeof vi.fn>

function sentEmailBodies(): string[] {
  return fetchMock.mock.calls.map((call) => {
    const init = call[1] as { body?: string } | undefined
    return String(init?.body ?? '')
  })
}

describe('paid webhook replays', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test-key'
    delete process.env.EMAIL_CAPTURE_DIR
    fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: 're_ticket_1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    )
    vi.stubGlobal('fetch', fetchMock)
  })

  it('confirms an already-paid member once and keeps that code on replay', async () => {
    const memory = createReplayAdmin(paidRegistration())
    harness.admin = memory.admin
    const session = {
      id: 'cs_member',
      amount_total: 3200,
      metadata: {
        type: 'event_fee',
        checkout_type: 'event_fee',
        event_id: MEMBER_EVENT_ID,
        user_id: MEMBER_USER_ID,
        fee_cents: '2500',
      },
      payment_status: 'paid' as const,
    }

    await markEventFeePaidFromCheckout(session)
    await markEventFeePaidFromCheckout(session)

    const sent = sentEmailBodies()
    expect(sent).toHaveLength(1)
    expect(sent[0]).toContain('Paid: $32.00')
    expect(sent[0]).not.toContain('$25.00')
    expect(sent[0]).toContain('Confirmation code: AB23CD45')
    expect(memory.snapshot().registration.confirmationCode).toBe('AB23CD45')
    expect(memory.snapshot().codes).toBe(1)
  })

  it('confirms an already-paid guest once and keeps that code on replay', async () => {
    const memory = createReplayAdmin(
      paidRegistration({
        id: GUEST_REGISTRATION_ID,
        kind: 'guest_event_registration',
        eventId: GUEST_EVENT_ID,
        userId: null,
        status: 'paid',
        paymentStatus: null,
        amountCents: 1800,
      })
    )
    const session = {
      id: 'cs_guest',
      mode: 'payment',
      payment_status: 'paid',
      metadata: {
        checkout_type: 'guest_event_fee',
        guest_registration_id: GUEST_REGISTRATION_ID,
        event_id: GUEST_EVENT_ID,
      },
    } as Stripe.Checkout.Session

    await applyGuestCheckoutSessionCompleted(memory.admin, session)
    await applyGuestCheckoutSessionCompleted(memory.admin, session)

    const sent = sentEmailBodies()
    expect(sent).toHaveLength(1)
    expect(sent[0]).toContain('Confirmation code: AB23CD45')
    expect(memory.snapshot().registration.confirmationCode).toBe('AB23CD45')
    expect(memory.snapshot().codes).toBe(1)
  })
})
