import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import type { Database } from '@/lib/database.types'
import {
  applyGuestCheckoutSessionCompleted,
  applyGuestCheckoutSessionExpired,
} from '@/lib/guest-event-webhook'

const REGISTRATION_ID = '22222222-2222-4222-8222-222222222222'
const EVENT_ID = '11111111-1111-4111-8111-111111111111'
const SESSION_ID = 'cs_test_secret_session'
const PAYMENT_INTENT_ID = 'pi_test_secret_intent'
const EMAIL = 'guest-secret@example.com'
const NAME = 'Secret Guest'

type Row = {
  id: string
  status: string
  stripe_checkout_session_id: string | null
  paid_at?: string | null
  stripe_payment_intent_id?: string | null
}

function createAdmin(rows: Row[]) {
  const updates: Record<string, unknown>[] = []
  const tables: string[] = []
  const admin = {
    from(table: string) {
      tables.push(table)
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
                      const row = rows.find(
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
                  const row = rows.find((item) => item.id === id)
                  if (row && statuses.includes(row.status)) {
                    Object.assign(row, payload)
                    updates.push(payload)
                    return { error: null, count: 1 }
                  }
                  return { error: null, count: 0 }
                },
                async eq(_statusColumn: string, status: string) {
                  const row = rows.find((item) => item.id === id)
                  if (row && row.status === status) {
                    Object.assign(row, payload)
                    updates.push(payload)
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
  }

  return { admin, updates, tables, rows }
}

function paidSession(
  overrides: Partial<Stripe.Checkout.Session> = {}
): Stripe.Checkout.Session {
  return {
    id: SESSION_ID,
    mode: 'payment',
    payment_status: 'paid',
    payment_intent: PAYMENT_INTENT_ID,
    metadata: {
      checkout_type: 'guest_event_fee',
      guest_registration_id: REGISTRATION_ID,
      event_id: EVENT_ID,
    },
    ...overrides,
  } as Stripe.Checkout.Session
}

describe('guest event fee webhook', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('marks a matching pending registration paid', async () => {
    const db = createAdmin([
      {
        id: REGISTRATION_ID,
        status: 'pending_payment',
        stripe_checkout_session_id: SESSION_ID,
      },
    ])

    await applyGuestCheckoutSessionCompleted(
      db.admin as unknown as SupabaseClient<Database>,
      paidSession()
    )

    expect(db.rows[0]).toMatchObject({
      status: 'paid',
      stripe_payment_intent_id: PAYMENT_INTENT_ID,
    })
    expect(db.rows[0]?.paid_at).toEqual(expect.any(String))
    expect(db.tables).toEqual(['guest_event_registrations', 'guest_event_registrations'])
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('leaves an already paid registration unchanged', async () => {
    const db = createAdmin([
      {
        id: REGISTRATION_ID,
        status: 'paid',
        stripe_checkout_session_id: SESSION_ID,
        paid_at: '2026-10-05T00:00:00.000Z',
      },
    ])

    await applyGuestCheckoutSessionCompleted(
      db.admin as unknown as SupabaseClient<Database>,
      paidSession()
    )
    await applyGuestCheckoutSessionCompleted(
      db.admin as unknown as SupabaseClient<Database>,
      paidSession()
    )

    expect(db.rows[0]?.status).toBe('paid')
    expect(db.rows[0]?.paid_at).toBe('2026-10-05T00:00:00.000Z')
    expect(db.updates).toHaveLength(0)
  })

  it.each(['cancelled', 'refunded'] as const)(
    'does not change a %s registration and logs only its id',
    async (status) => {
      const db = createAdmin([
        {
          id: REGISTRATION_ID,
          status,
          stripe_checkout_session_id: SESSION_ID,
        },
      ])

      await expect(
        applyGuestCheckoutSessionCompleted(
          db.admin as unknown as SupabaseClient<Database>,
          paidSession()
        )
      ).rejects.toThrow(REGISTRATION_ID)

      expect(db.rows[0]?.status).toBe(status)
      expect(db.updates).toHaveLength(0)
      const logged = warnSpy.mock.calls.flat().join(' ')
      expect(logged).toContain(REGISTRATION_ID)
      expect(logged).toContain(status)
      expect(logged).not.toContain(EMAIL)
      expect(logged).not.toContain(NAME)
      expect(logged).not.toContain(SESSION_ID)
      expect(logged).not.toContain(PAYMENT_INTENT_ID)
    }
  )

  it('marks a still-pending registration expired and ignores other statuses', async () => {
    const pending = createAdmin([
      {
        id: REGISTRATION_ID,
        status: 'pending_payment',
        stripe_checkout_session_id: SESSION_ID,
      },
    ])
    await applyGuestCheckoutSessionExpired(
      pending.admin as unknown as SupabaseClient<Database>,
      paidSession({ payment_status: 'unpaid' })
    )
    expect(pending.rows[0]?.status).toBe('expired')

    const paid = createAdmin([
      {
        id: REGISTRATION_ID,
        status: 'paid',
        stripe_checkout_session_id: SESSION_ID,
      },
    ])
    await applyGuestCheckoutSessionExpired(
      paid.admin as unknown as SupabaseClient<Database>,
      paidSession()
    )
    expect(paid.rows[0]?.status).toBe('paid')
    expect(paid.updates).toHaveLength(0)
  })

  it('ignores a completed or expired event when the session id does not match', async () => {
    const db = createAdmin([
      {
        id: REGISTRATION_ID,
        status: 'pending_payment',
        stripe_checkout_session_id: 'cs_other',
      },
    ])

    await expect(
      applyGuestCheckoutSessionCompleted(
        db.admin as unknown as SupabaseClient<Database>,
        paidSession()
      )
    ).rejects.toThrow('registration_not_found')
    await expect(
      applyGuestCheckoutSessionExpired(
        db.admin as unknown as SupabaseClient<Database>,
        paidSession()
      )
    ).rejects.toThrow('registration_not_found')

    expect(db.rows[0]?.status).toBe('pending_payment')
    expect(db.updates).toHaveLength(0)
    const logged = warnSpy.mock.calls.flat().join(' ')
    expect(logged).toContain(REGISTRATION_ID)
    expect(logged).not.toContain(SESSION_ID)
    expect(logged).not.toContain(PAYMENT_INTENT_ID)
    expect(logged).not.toContain(EMAIL)
  })

  it('does not record an unpaid guest checkout as applied', async () => {
    const db = createAdmin([
      {
        id: REGISTRATION_ID,
        status: 'pending_payment',
        stripe_checkout_session_id: SESSION_ID,
      },
    ])

    await expect(
      applyGuestCheckoutSessionCompleted(
        db.admin as unknown as SupabaseClient<Database>,
        paidSession({ payment_status: 'unpaid' })
      )
    ).rejects.toThrow('payment_not_paid')

    expect(db.rows[0]?.status).toBe('pending_payment')
    expect(db.updates).toHaveLength(0)
    const logged = warnSpy.mock.calls.flat().join(' ')
    expect(logged).toContain(REGISTRATION_ID)
    expect(logged).not.toContain(SESSION_ID)
    expect(logged).not.toContain(EMAIL)
  })

  it('can still mark an expired hold paid when the matching payment completes', async () => {
    const db = createAdmin([
      {
        id: REGISTRATION_ID,
        status: 'expired',
        stripe_checkout_session_id: SESSION_ID,
      },
    ])

    await applyGuestCheckoutSessionCompleted(
      db.admin as unknown as SupabaseClient<Database>,
      paidSession()
    )

    expect(db.rows[0]?.status).toBe('paid')
  })
})

describe('stripe webhook route branches', () => {
  const route = readFileSync(
    resolve(process.cwd(), 'app/api/stripe/webhook/route.ts'),
    'utf8'
  )

  it('handles guest fees and expired sessions without replacing the other branches', () => {
    expect(route).toContain("checkout_type === 'event_sponsorship'")
    expect(route).toContain("checkout_type === 'event_fee'")
    expect(route).toContain("checkout_type === 'guest_event_fee'")
    expect(route).toContain("case 'checkout.session.expired'")
    expect(route).toContain('applyGuestCheckoutSessionCompleted')
    expect(route).toContain('applyGuestCheckoutSessionExpired')
    expect(route).toContain('markSponsorshipPaidFromCheckout')
    expect(route).toContain('markEventFeePaidFromCheckout')
    expect(route).toContain('syncStripeSubscription')
    expect(route.indexOf('hasProcessedStripeEvent')).toBeLessThan(
      route.indexOf('handleStripeEvent')
    )

    const guestStart = route.indexOf("checkout_type === 'guest_event_fee'")
    const memberFeeStart = route.indexOf("checkout_type === 'event_fee'")
    const guestBlock = route.slice(guestStart, memberFeeStart)
    expect(guestBlock).not.toContain("payment_status !== 'paid'")
    expect(guestBlock).toContain('applyGuestCheckoutSessionCompleted')
    expect(route.indexOf('await handleStripeEvent(event)')).toBeLessThan(
      route.indexOf('markStripeEventProcessed(event.id, event.type)')
    )

    for (const file of [
      'lib/guest-event-webhook.ts',
      'lib/reconcile-guest-payment.ts',
      'scripts/reconcile-guest-payment.ts',
    ]) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8')
      for (const name of [
        'requireEntitledViewer',
        'evaluateEventRegistration',
        'consumeEventCredit',
        'consumeCircleSocialCredit',
        'createEventFeeCheckoutSession',
        'markEventFeePaidFromCheckout',
        'event_attendees',
        'event_registration_ledger',
        'membership_entitlement_cycles',
      ]) {
        expect(source).not.toContain(name)
      }
    }
  })
})
