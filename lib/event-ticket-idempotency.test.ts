import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
  type AdmissionRow,
  type AdmissionSource,
  claimEventTicketEmail,
  commitEventAdmission,
  confirmEventAdmission,
  deliverEventTicketOutbox,
  finishEventTicketEmail,
  type TicketEmailRow,
} from '@/lib/event-ticket-admission'

const START = Date.parse('2026-11-06T18:00:00.000Z')

function registration(): AdmissionRow {
  return {
    id: 'attendee-1',
    kind: 'event_attendee',
    eventId: 'event-1',
    userId: 'user-1',
    status: 'going',
    paymentStatus: 'paid',
    confirmationCode: null,
    confirmedAt: null,
    admissionSource: null,
    amountPaidCents: null,
    amountCents: null,
  }
}

function createMailbox(options: { failFirstSuccessfulFinish?: boolean } = {}) {
  let current = registration()
  let outbox: TicketEmailRow | null = null
  let codes = 0
  let tokens = 0
  let nowMs = START
  let failFinish = options.failFirstSuccessfulFinish === true

  const now = () => new Date(nowMs).toISOString()
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
            now: now(),
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
        const claimed = claimEventTicketEmail(outbox, now(), Number(args.p_lease_seconds), () => {
          tokens += 1
          return `token-${tokens}`
        })
        outbox = claimed.outbox
        return {
          data: { row: claimed.claimed ? { claim_token: outbox.claimToken } : null },
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
              to: 'ada@example.com',
              attendee_name: 'Ada Lovelace',
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
        if (args.p_succeeded === true && failFinish) {
          failFinish = false
          return { data: { ok: false }, error: null }
        }
        const finished = finishEventTicketEmail(outbox, {
          claimToken: String(args.p_claim_token),
          succeeded: args.p_succeeded === true,
          resendMessageId:
            typeof args.p_resend_message_id === 'string' ? args.p_resend_message_id : null,
          lastError: typeof args.p_last_error === 'string' ? args.p_last_error : null,
          now: now(),
        })
        if (finished.ok) outbox = finished.outbox
        return { data: { ok: finished.ok }, error: null }
      }

      return { data: null, error: { message: 'unexpected rpc' } }
    },
  }

  return {
    admin: admin as unknown as SupabaseClient<Database>,
    advance(ms: number) {
      nowMs += ms
    },
    snapshot: () => ({ registration: current, outbox, codes }),
  }
}

function requestInit(call: unknown[]) {
  return call[1] as { body?: string; headers?: Record<string, string> }
}

describe('ticket send idempotency', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test-key'
    delete process.env.EMAIL_CAPTURE_DIR
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('retries a failed finish with the same idempotency key and one recorded ticket', async () => {
    const mailbox = createMailbox({ failFirstSuccessfulFinish: true })
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: 're_ticket_1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const first = await confirmEventAdmission(mailbox.admin, {
      registrationKind: 'event_attendee',
      eventId: 'event-1',
      userId: 'user-1',
      admissionSource: 'paid',
      amountPaidCents: 2500,
      paymentStatus: 'paid',
      creditsRemaining: null,
    })
    expect(first).toMatchObject({ ok: true, emailSent: true, confirmationCode: 'AB23CD45' })
    expect(mailbox.snapshot().outbox?.status).toBe('processing')

    mailbox.advance(21_000)
    const second = await deliverEventTicketOutbox(mailbox.admin, 'outbox-1')

    expect(second).toEqual({ emailSent: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const firstInit = requestInit(fetchMock.mock.calls[0] ?? [])
    const secondInit = requestInit(fetchMock.mock.calls[1] ?? [])
    expect(firstInit.headers?.['Idempotency-Key']).toBe('event-ticket/outbox-1')
    expect(secondInit.headers?.['Idempotency-Key']).toBe('event-ticket/outbox-1')
    expect(secondInit.body).toBe(firstInit.body)
    expect(mailbox.snapshot().outbox).toMatchObject({
      status: 'sent',
      resendMessageId: 're_ticket_1',
    })
    expect(mailbox.snapshot().codes).toBe(1)
    expect(mailbox.snapshot().registration.confirmationCode).toBe('AB23CD45')
    expect(console.error).toHaveBeenCalledWith('[event_ticket_email]', 'ticket_finish_failed')
  })

  it('retries a concurrent idempotency response', async () => {
    const mailbox = createMailbox()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ name: 'concurrent_idempotent_requests', statusCode: 409 }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 're_ticket_1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    vi.stubGlobal('fetch', fetchMock)

    const result = await confirmEventAdmission(mailbox.admin, {
      registrationKind: 'event_attendee',
      eventId: 'event-1',
      userId: 'user-1',
      admissionSource: 'paid',
      amountPaidCents: 2500,
      paymentStatus: 'paid',
      creditsRemaining: null,
    })

    expect(result).toMatchObject({ ok: true, emailSent: true, confirmationCode: 'AB23CD45' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(requestInit(fetchMock.mock.calls[0] ?? []).headers?.['Idempotency-Key']).toBe(
      'event-ticket/outbox-1'
    )
    expect(requestInit(fetchMock.mock.calls[1] ?? []).headers?.['Idempotency-Key']).toBe(
      'event-ticket/outbox-1'
    )
    expect(mailbox.snapshot().outbox?.status).toBe('sent')
  })
})
