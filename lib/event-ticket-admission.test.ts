import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
  type AdmissionRow,
  type AdmissionSource,
  claimEventTicketEmail,
  commitEventAdmission,
  confirmEventAdmission,
  finishEventTicketEmail,
  memberTicketAdmission,
  retryEventTicketEmail,
  type TicketEmailRow,
} from '@/lib/event-ticket-admission'

const sendEventTicketEmail = vi.hoisted(() => vi.fn())

vi.mock('@/lib/transactional-email', () => ({
  sendEventTicketEmail,
}))

const NOW = '2026-11-06T18:00:00.000Z'

function registration(overrides: Partial<AdmissionRow> = {}): AdmissionRow {
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
    ...overrides,
  }
}

function createMemory(initial: AdmissionRow) {
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
        const claimed = claimEventTicketEmail(
          outbox,
          NOW,
          Number(args.p_lease_seconds),
          () => {
            tokens += 1
            return `token-${tokens}`
          }
        )
        outbox = claimed.outbox
        return {
          data: {
            row: claimed.claimed ? { claim_token: outbox.claimToken } : null,
          },
          error: null,
        }
      }

      if (fn === 'load_event_ticket_email_context') {
        if (
          !outbox ||
          outbox.claimToken !== args.p_claim_token ||
          outbox.status !== 'processing'
        ) {
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
      const query = {
        eq() {
          return query
        },
        async maybeSingle() {
          if (table === 'event_ticket_emails') {
            return {
              data: outbox ? { id: outbox.id, status: outbox.status } : null,
              error: null,
            }
          }
          if (!current.confirmedAt) return { data: null, error: null }
          if (table === 'event_attendees' && current.kind !== 'event_attendee') {
            return { data: null, error: null }
          }
          if (
            table === 'guest_event_registrations' &&
            current.kind !== 'guest_event_registration'
          ) {
            return { data: null, error: null }
          }
          return {
            data: {
              id: current.id,
              event_id: current.eventId,
              confirmed_at: current.confirmedAt,
            },
            error: null,
          }
        },
      }
      return { select: () => query }
    },
  }

  return {
    admin: admin as unknown as SupabaseClient<Database>,
    snapshot: () => ({ registration: current, outbox, codes }),
  }
}

async function confirm(memory: ReturnType<typeof createMemory>, source: AdmissionSource, amount: number | null, credits: number | null) {
  const row = memory.snapshot().registration
  return confirmEventAdmission(memory.admin, {
    registrationKind: row.kind,
    eventId: row.eventId,
    userId: row.userId,
    registrationId: row.kind === 'guest_event_registration' ? row.id : null,
    admissionSource: source,
    amountPaidCents: amount,
    paymentStatus: source === 'paid' ? 'paid' : 'not_required',
    creditsRemaining: credits,
  })
}

describe('ticket confirmation paths', () => {
  beforeEach(() => {
    sendEventTicketEmail.mockReset()
    sendEventTicketEmail.mockResolvedValue({ sent: true, id: 're_ticket_1' })
  })

  it.each([
    {
      name: 'stripe',
      row: registration(),
      source: 'paid' as const,
      amount: 2500,
      credits: null,
      line: 'paid',
    },
    {
      name: 'guest checkout',
      row: registration({
        id: 'guest-1',
        kind: 'guest_event_registration',
        userId: null,
        status: 'paid',
        paymentStatus: null,
        amountCents: 4000,
      }),
      source: 'paid' as const,
      amount: null,
      credits: null,
      line: 'paid',
    },
    {
      name: 'circle social credit',
      row: registration({ paymentStatus: null }),
      source: 'circle_social_credit' as const,
      amount: 0,
      credits: 1,
      line: 'circle_social_credit',
    },
    {
      name: 'premium event credit',
      row: registration({ paymentStatus: null }),
      source: 'premium_event_credit' as const,
      amount: 0,
      credits: 1,
      line: 'premium_event_credit',
    },
    {
      name: 'included membership',
      row: registration({ paymentStatus: 'not_required' }),
      source: 'included' as const,
      amount: 0,
      credits: null,
      line: 'included',
    },
    {
      name: 'free admission',
      row: registration({ paymentStatus: 'not_required' }),
      source: 'free' as const,
      amount: 0,
      credits: null,
      line: 'free',
    },
  ])('sends one $name ticket email', async ({ row, source, amount, credits, line }) => {
    const memory = createMemory(row)
    const result = await confirm(memory, source, amount, credits)

    expect(result.ok).toBe(true)
    expect(sendEventTicketEmail).toHaveBeenCalledTimes(1)
    expect(sendEventTicketEmail.mock.calls[0]?.[0]).toMatchObject({
      admissionSource: line,
      confirmationCode: 'AB23CD45',
    })
    expect(memory.snapshot().outbox?.status).toBe('sent')
    expect(memory.snapshot().codes).toBe(1)
  })

  it('does not email a pending, expired, or unpaid registration', async () => {
    for (const status of ['pending_payment', 'expired'] as const) {
      sendEventTicketEmail.mockClear()
      const memory = createMemory(
        registration({
          id: 'guest-1',
          kind: 'guest_event_registration',
          userId: null,
          status,
          paymentStatus: null,
          amountCents: 2500,
        })
      )
      const result = await confirm(memory, 'paid', null, null)
      expect(result).toEqual({ ok: false, error: 'not_confirmed' })
      expect(sendEventTicketEmail).not.toHaveBeenCalled()
      expect(memory.snapshot().registration.confirmationCode).toBeNull()
      expect(memory.snapshot().outbox).toBeNull()
    }
  })

  it('does not email when a credit update does not change exactly one row', () => {
    expect(
      memberTicketAdmission({
        eventType: 'premium_event',
        method: 'credit',
        creditKind: 'premium_event',
        creditRowsChanged: 0,
        creditsRemaining: 1,
      })
    ).toBeNull()
    expect(
      memberTicketAdmission({
        eventType: 'circle_social',
        method: 'credit',
        creditKind: 'circle_social',
        creditRowsChanged: 2,
        creditsRemaining: 1,
      })
    ).toBeNull()
    expect(
      memberTicketAdmission({
        eventType: 'premium_event',
        method: 'credit',
        creditKind: 'premium_event',
        creditRowsChanged: 1,
        creditsRemaining: 1,
      })?.admissionSource
    ).toBe('premium_event_credit')
    expect(
      memberTicketAdmission({
        eventType: 'standard_event',
        method: 'included_unlimited',
        creditRowsChanged: null,
        creditsRemaining: null,
      })?.admissionSource
    ).toBe('free')
    expect(
      memberTicketAdmission({
        eventType: 'circle_social',
        method: 'included_unlimited',
        creditRowsChanged: null,
        creditsRemaining: null,
      })?.admissionSource
    ).toBe('included')
  })

  it('sends one email when the same confirmation is delivered twice', async () => {
    const memory = createMemory(registration())
    const first = await confirm(memory, 'paid', 2500, null)
    const second = await confirm(memory, 'paid', 2500, null)

    expect(first).toMatchObject({
      ok: true,
      alreadyConfirmed: false,
      confirmationCode: 'AB23CD45',
      emailSent: true,
    })
    expect(second).toMatchObject({
      ok: true,
      alreadyConfirmed: true,
      confirmationCode: 'AB23CD45',
      emailSent: false,
    })
    expect(sendEventTicketEmail).toHaveBeenCalledTimes(1)
    expect(memory.snapshot().codes).toBe(1)
    expect(memory.snapshot().registration.confirmationCode).toBe('AB23CD45')
  })

  it('keeps the RSVP and confirmation code when Resend fails', async () => {
    sendEventTicketEmail
      .mockRejectedValueOnce(new Error('resend down'))
      .mockResolvedValueOnce({ sent: true, id: 're_ticket_2' })
    const memory = createMemory(registration())

    const result = await confirm(memory, 'paid', 2500, null)
    const replay = await confirm(memory, 'paid', 2500, null)

    expect(result).toMatchObject({
      ok: true,
      confirmationCode: 'AB23CD45',
      emailSent: true,
    })
    expect(replay).toMatchObject({
      ok: true,
      alreadyConfirmed: true,
      confirmationCode: 'AB23CD45',
      emailSent: false,
    })
    expect(memory.snapshot().registration).toMatchObject({
      status: 'going',
      paymentStatus: 'paid',
      confirmationCode: 'AB23CD45',
      confirmedAt: NOW,
    })
    expect(memory.snapshot().outbox?.status).toBe('sent')
    expect(memory.snapshot().codes).toBe(1)
    expect(sendEventTicketEmail).toHaveBeenCalledTimes(2)
    expect(sendEventTicketEmail.mock.calls[0]?.[0].confirmationCode).toBe('AB23CD45')
    expect(sendEventTicketEmail.mock.calls[1]?.[0].confirmationCode).toBe('AB23CD45')
  })

  it('does not retry a ticket that was never confirmed', async () => {
    const memory = createMemory(registration({ confirmedAt: null }))
    const result = await retryEventTicketEmail(memory.admin, {
      registrationKind: 'event_attendee',
      eventId: 'event-1',
      userId: 'user-1',
    })

    expect(result).toEqual({ emailSent: false })
    expect(sendEventTicketEmail).not.toHaveBeenCalled()
  })
})

describe('ticket confirmation call sites', () => {
  const rsvp = readFileSync(
    resolve(process.cwd(), 'app/(club)/events/rsvp-actions.ts'),
    'utf8'
  )
  const checkout = readFileSync(
    resolve(process.cwd(), 'lib/stripe/event-fee-checkout.ts'),
    'utf8'
  )
  const guest = readFileSync(
    resolve(process.cwd(), 'lib/guest-event-webhook.ts'),
    'utf8'
  )
  const sql = readFileSync(
    resolve(
      process.cwd(),
      'supabase/migrations/20261106120000_event_ticket_confirmation.sql'
    ),
    'utf8'
  )

  it('confirms credits only after one row changes, and not while checkout is pending', () => {
    expect(rsvp.indexOf('await consumeEventCredit')).toBeLessThan(
      rsvp.indexOf('const admission = memberTicketAdmission')
    )
    expect(rsvp.indexOf('await consumeCircleSocialCredit')).toBeLessThan(
      rsvp.indexOf('const admission = memberTicketAdmission')
    )
    const checkoutStart = rsvp.indexOf('shouldUseEventFeeCheckout({')
    const afterCheckout = rsvp.indexOf('const registrationMethod')
    expect(rsvp.slice(checkoutStart, afterCheckout)).not.toContain('confirmEventAdmission')
    const writeFailure = rsvp.slice(
      rsvp.indexOf('if (creditConsumed && entitlementCycleId)'),
      rsvp.indexOf('const admission = memberTicketAdmission')
    )
    expect(writeFailure).toContain('returnEventCredit')
    expect(writeFailure).toContain('returnCircleSocialCredit')
    expect(writeFailure).not.toContain('confirmEventAdmission')
  })

  it('confirms a member fee only when Checkout payment_status is paid', () => {
    expect(checkout.indexOf("session.payment_status !== 'paid'")).toBeLessThan(
      checkout.indexOf('await confirmEventAdmission')
    )
    expect(checkout).toContain("session.payment_status === 'paid' && existing.payment_status === 'paid'")
    expect(checkout).toContain('session.amount_total')
    expect(checkout).toContain("throw new Error('confirm_failed')")
    expect(checkout).not.toContain('retryEventTicketEmail')
    const unpaid = checkout.slice(
      checkout.indexOf('markEventFeePaidFromCheckout'),
      checkout.indexOf('const eventId = session.metadata?.event_id')
    )
    expect(unpaid).toContain('Checkout session is not paid.')
    expect(unpaid).not.toContain('confirmEventAdmission')
  })

  it('leaves guest expiry and credit-unrelated failures without a ticket email', () => {
    const expired = guest.slice(guest.indexOf('applyGuestCheckoutSessionExpired'))
    expect(expired).not.toContain('confirmEventAdmission')
    expect(expired).not.toContain('retryEventTicketEmail')
    expect(guest).toContain("throw new Error('confirm_failed')")
    expect(guest).not.toContain('retryEventTicketEmail')
    expect(guest.indexOf("session.payment_status !== 'paid'")).toBeLessThan(
      guest.indexOf('await confirmEventAdmission')
    )
  })

  it('locks the registration and leases the outbox for the service role', () => {
    const confirmSql = sql.slice(
      sql.indexOf('function public.confirm_event_admission'),
      sql.indexOf('function public.claim_event_ticket_email')
    )
    expect(confirmSql.indexOf("'already_confirmed', true")).toBeLessThan(
      confirmSql.indexOf('generate_event_confirmation_code()')
    )
    expect(confirmSql).toContain('for update')
    expect(confirmSql).toContain("payment_status = 'pending'")
    expect(confirmSql).toContain("status is distinct from 'paid'")
    expect(sql).toContain('for update skip locked')
    expect(sql).toContain('event_ticket_emails_registration_email_key')
    expect(sql).toContain('lease_expires_at')
    expect(sql).toContain('claim_token')
    expect(sql).toContain('attempts >= 0 and attempts <= 5')
    expect(sql).toContain("'ticket_confirmation'")
    expect(sql).toContain('confirmation_code')
    expect(sql).toContain('confirmed_at')
    expect(sql).toContain('admission_source')
    expect(sql).toContain('amount_paid_cents')
    expect(sql).toContain('enable row level security')
    expect(sql).toContain(
      'revoke all on table public.event_ticket_emails from anon, authenticated'
    )
    expect(sql).toContain('grant all on table public.event_ticket_emails to service_role')
    expect(sql).not.toMatch(/create policy[\s\S]*event_ticket_emails/i)
  })
})

describe('confirm RPC errors', () => {
  it('logs the postgres code and message when confirm fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const admin = {
      rpc: async () => ({
        data: null,
        error: {
          code: '42702',
          message: 'column reference "registration_id" is ambiguous',
        },
      }),
    } as unknown as SupabaseClient<Database>

    const result = await confirmEventAdmission(admin, {
      registrationKind: 'event_attendee',
      eventId: 'event-1',
      userId: 'user-1',
      admissionSource: 'free',
      amountPaidCents: 0,
      paymentStatus: 'not_required',
    })

    expect(result).toEqual({ ok: false, error: 'confirm_failed' })
    expect(errorSpy).toHaveBeenCalledWith(
      '[event_ticket_email]',
      'confirm_failed',
      '42702',
      'column reference "registration_id" is ambiguous'
    )
    expect(sendEventTicketEmail).not.toHaveBeenCalled()
    const logged = errorSpy.mock.calls.flat().join(' ')
    expect(logged).not.toMatch(/@/)
  })
})
