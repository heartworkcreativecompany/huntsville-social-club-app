import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import type { Database } from '@/lib/database.types'
import {
  reconcileGuestPayment,
  type GuestPaymentStripe,
} from '@/lib/reconcile-guest-payment'

const REGISTRATION_ID = '8a5f2adc-eeee-41ef-be7d-a17ea4ff7613'
const EVENT_ID = '72df581f-d761-4f24-a583-95b6f1e0c63c'
const SESSION_ID = 'cs_test_secret_session'
const PAYMENT_INTENT_ID = 'pi_test_secret_intent'
const EMAIL = 'guest-secret@example.com'

type Row = {
  id: string
  event_id: string
  status: string
  stripe_checkout_session_id: string | null
  paid_at?: string | null
  stripe_payment_intent_id?: string | null
}

function createHarness(row: Row) {
  const updates: Record<string, unknown>[] = []
  const admin = {
    from(table: string) {
      if (table !== 'guest_event_registrations') {
        throw new Error(`unexpected table ${table}`)
      }
      return {
        select() {
          return {
            eq() {
              return {
                async maybeSingle() {
                  return { data: row, error: null }
                },
              }
            },
          }
        },
        update(payload: Record<string, unknown>) {
          return {
            eq() {
              return {
                async in(_column: string, statuses: string[]) {
                  if (!statuses.includes(row.status)) {
                    return { error: null, count: 0 }
                  }
                  Object.assign(row, payload)
                  updates.push(payload)
                  return { error: null, count: 1 }
                },
              }
            },
          }
        },
      }
    },
  }
  const retrieve = vi.fn(async () => paidSession())
  const stripe: GuestPaymentStripe = {
    checkout: { sessions: { retrieve } },
  }
  return { admin, updates, row, retrieve, stripe }
}

function paidSession(
  overrides: Partial<Stripe.Checkout.Session> = {}
): Stripe.Checkout.Session {
  return {
    id: SESSION_ID,
    status: 'complete',
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

function pendingRow(status = 'pending_payment'): Row {
  return {
    id: REGISTRATION_ID,
    event_id: EVENT_ID,
    status,
    stripe_checkout_session_id: SESSION_ID,
  }
}

describe('reconcileGuestPayment', () => {
  it('dry run writes nothing when the stored session is paid', async () => {
    const db = createHarness(pendingRow())
    const outcome = await reconcileGuestPayment(
      db.admin as unknown as SupabaseClient<Database>,
      db.stripe,
      REGISTRATION_ID,
      { dryRun: true }
    )

    expect(outcome).toBe('would_mark_paid')
    expect(db.updates).toHaveLength(0)
    expect(db.row.status).toBe('pending_payment')
    expect(db.retrieve).toHaveBeenCalledTimes(1)
  })

  it('marks a pending or expired row paid when the session matches', async () => {
    for (const status of ['pending_payment', 'expired'] as const) {
      const db = createHarness(pendingRow(status))
      const outcome = await reconcileGuestPayment(
        db.admin as unknown as SupabaseClient<Database>,
        db.stripe,
        REGISTRATION_ID,
        { dryRun: false }
      )
      expect(outcome).toBe('marked_paid')
      expect(db.row).toMatchObject({
        status: 'paid',
        stripe_payment_intent_id: PAYMENT_INTENT_ID,
      })
      expect(db.row.paid_at).toEqual(expect.any(String))
    }
  })

  it('does nothing when the row is already paid', async () => {
    const db = createHarness({
      ...pendingRow('paid'),
      paid_at: '2026-10-06T02:21:51.000Z',
    })
    const outcome = await reconcileGuestPayment(
      db.admin as unknown as SupabaseClient<Database>,
      db.stripe,
      REGISTRATION_ID,
      { dryRun: false }
    )
    expect(outcome).toBe('already_paid')
    expect(db.updates).toHaveLength(0)
    expect(db.retrieve).not.toHaveBeenCalled()
    expect(db.row.paid_at).toBe('2026-10-06T02:21:51.000Z')
  })

  it.each(['cancelled', 'refunded'] as const)(
    'refuses a %s row without writing',
    async (status) => {
      const db = createHarness(pendingRow(status))
      const outcome = await reconcileGuestPayment(
        db.admin as unknown as SupabaseClient<Database>,
        db.stripe,
        REGISTRATION_ID,
        { dryRun: false }
      )
      expect(outcome).toBe('refused')
      expect(db.updates).toHaveLength(0)
      expect(db.row.status).toBe(status)
      expect(db.retrieve).not.toHaveBeenCalled()
    }
  )

  it('refuses an unpaid session', async () => {
    const db = createHarness(pendingRow())
    db.retrieve.mockResolvedValueOnce(paidSession({ payment_status: 'unpaid' }))
    const outcome = await reconcileGuestPayment(
      db.admin as unknown as SupabaseClient<Database>,
      db.stripe,
      REGISTRATION_ID,
      { dryRun: false }
    )
    expect(outcome).toBe('refused')
    expect(db.updates).toHaveLength(0)
    expect(db.row.status).toBe('pending_payment')
  })

  it('refuses mismatched guest metadata', async () => {
    const db = createHarness(pendingRow())
    db.retrieve.mockResolvedValueOnce(
      paidSession({
        metadata: {
          checkout_type: 'guest_event_fee',
          guest_registration_id: REGISTRATION_ID,
          event_id: '00000000-0000-4000-8000-000000000000',
        },
      })
    )
    const outcome = await reconcileGuestPayment(
      db.admin as unknown as SupabaseClient<Database>,
      db.stripe,
      REGISTRATION_ID,
      { dryRun: false }
    )
    expect(outcome).toBe('refused')
    expect(db.updates).toHaveLength(0)
    expect(JSON.stringify(db.updates)).not.toContain(EMAIL)
    expect(JSON.stringify(db.updates)).not.toContain(SESSION_ID)
  })

  it('script prints only an id and outcome and supports dry run', () => {
    const script = readFileSync(
      resolve(process.cwd(), 'scripts/reconcile-guest-payment.ts'),
      'utf8'
    )
    expect(script).toContain('--dry-run')
    expect(script).toContain('reconcileGuestPayment')
    expect(script).toContain('`${registrationId} ${outcome}`')
    expect(script).not.toContain('sessions.create')
    expect(script).not.toContain(EMAIL)
  })
})
