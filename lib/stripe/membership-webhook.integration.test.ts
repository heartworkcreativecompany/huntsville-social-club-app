import { readFileSync } from 'node:fs'
import path from 'node:path'
import { Pool, type PoolClient } from 'pg'
import Stripe from 'stripe'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { NEW_PURCHASE_STRIPE_PRICE_IDS } from '@/lib/circle-benefit-packages'
import { STRIPE_LIVE_PRICE_IDS } from '@/lib/stripe/config'
import {
  assertCircleEntitlementDestructiveTestAllowed,
  CIRCLE_ENTITLEMENT_MAINTENANCE_DATABASE,
  CIRCLE_ENTITLEMENT_TEST_DATABASE_NAME,
  circleEntitlementMaintenanceDatabaseUrl,
  type CircleEntitlementTestTarget,
} from '@/lib/circle-entitlement-db-guard'

const webhookSecret = `whsec_${Buffer.from('isolated-membership-webhook-secret').toString('base64')}`
process.env.STRIPE_WEBHOOK_SECRET = webhookSecret

const stripeHolder: { current: Stripe | null } = { current: null }
const adminHolder: { current: ReturnType<typeof adminClient> | null } = {
  current: null,
}

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
vi.mock('@/lib/compatibility/subscription-sync-hook', () => ({
  runCompatibilitySubscriptionLifecycle: async () => undefined,
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => adminHolder.current,
}))
vi.mock('@/lib/stripe/config', async () => {
  const actual = await vi.importActual<typeof import('@/lib/stripe/config')>(
    '@/lib/stripe/config'
  )
  return {
    ...actual,
    getStripe: () => {
      if (!stripeHolder.current) throw new Error('test Stripe client is not ready')
      return stripeHolder.current
    },
  }
})

const { POST } = await import('@/app/api/stripe/webhook/route')

const MIGRATION_PATH = path.join(
  process.cwd(),
  'supabase/migrations/20261028230000_entitlement_cycle_atomic_replace.sql'
)

const USER_PAID = '12121212-1212-4212-8212-121212121212'
const USER_UNPAID = '13131313-1313-4313-8313-131313131313'
const USER_ORDER_A = '14141414-1414-4414-8414-141414141414'
const USER_ORDER_B = '15151515-1515-4515-8515-151515151515'
const USER_RETRY = '16161616-1616-4616-8616-161616161616'
const USER_NEW_INNER = '17171717-1717-4717-8717-171717171717'
const USER_NEW_ELITE = '18181818-1818-4818-8818-181818181818'
const USER_LEGACY_RENEW = '19191919-1919-4919-8919-191919191919'
const PERIOD_START = 1761955200
const PERIOD_END = 1764547200
const LIVE_INNER = STRIPE_LIVE_PRICE_IDS.inner_circle

let pool: Pool | null = null
let disposableReady = false

function adminClient(db: Pool) {
  return {
    from(table: string) {
      return new TableQuery(db, table)
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      if (fn !== 'replace_membership_entitlement_cycle') {
        return {
          data: null,
          error: {
            code: 'PGRST202',
            message: 'apply_membership_billing_sync is not installed in this fixture',
          },
        }
      }
      const result = await db.query(
        `select public.replace_membership_entitlement_cycle($1,$2,$3,$4,$5,$6,$7) as cycle`,
        [
          args.p_user_id,
          args.p_product_tier,
          args.p_period_start,
          args.p_period_end,
          args.p_credits_granted,
          args.p_guest_invites_granted,
          args.p_circle_social_credits_granted,
        ]
      )
      return { data: result.rows[0]?.cycle ?? null, error: null }
    },
  }
}

class TableQuery implements PromiseLike<{ data: null; error: null }> {
  private action: 'select' | 'insert' | 'update' = 'select'
  private filters: { column: string; value: unknown }[] = []
  private payload: Record<string, unknown> | null = null

  constructor(
    private readonly db: Pool,
    private readonly table: string
  ) {}

  select() {
    this.action = 'select'
    return this
  }

  insert(payload: Record<string, unknown>) {
    this.action = 'insert'
    this.payload = payload
    return this
  }

  update(payload: Record<string, unknown>) {
    this.action = 'update'
    this.payload = payload
    return this
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value })
    return this
  }

  order() {
    return this
  }

  limit() {
    return this
  }

  maybeSingle() {
    return this.finish()
  }

  single() {
    return this.finish()
  }

  then<TResult1 = { data: null; error: null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: null; error: null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.finish().then(onfulfilled, onrejected)
  }

  private async finish() {
    if (this.table === 'stripe_webhook_events' && this.action === 'select') {
      const eventId = this.filters.find((filter) => filter.column === 'event_id')?.value
      const result = await this.db.query(
        'select event_id from public.stripe_webhook_events where event_id = $1',
        [eventId]
      )
      return { data: result.rows[0] ?? null, error: null }
    }
    if (this.table === 'stripe_webhook_events' && this.action === 'insert') {
      try {
        await this.db.query(
          'insert into public.stripe_webhook_events (event_id, event_type) values ($1, $2)',
          [this.payload?.event_id, this.payload?.event_type]
        )
        return { data: null, error: null }
      } catch (error) {
        const pgError = error as { code?: string; message?: string }
        return {
          data: null,
          error: { code: pgError.code, message: pgError.message ?? 'insert failed' },
        }
      }
    }
    if (this.table === 'profiles' && this.action === 'select') {
      const id = this.filters.find((filter) => filter.column === 'id')?.value
      const result = await this.db.query(
        'select membership_billing, role from public.profiles where id = $1',
        [id]
      )
      return { data: result.rows[0] ?? null, error: null }
    }
    if (this.table === 'profiles' && this.action === 'update') {
      const id = this.filters.find((filter) => filter.column === 'id')?.value
      await this.db.query(
        `update public.profiles
         set membership_billing = $2::jsonb, updated_at = $3
         where id = $1`,
        [id, JSON.stringify(this.payload?.membership_billing ?? {}), this.payload?.updated_at]
      )
      return { data: null, error: null }
    }
    return {
      data: null,
      error: { message: `fixture does not implement ${this.action} on ${this.table}` },
    }
  }
}

async function withMaintenance<T>(
  allowed: CircleEntitlementTestTarget,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const maintenance = new Pool({
    connectionString: circleEntitlementMaintenanceDatabaseUrl(allowed),
    max: 1,
  })
  const client = await maintenance.connect()
  try {
    const current = await client.query('select current_database() as name')
    if (String(current.rows[0]?.name ?? '') !== CIRCLE_ENTITLEMENT_MAINTENANCE_DATABASE) {
      throw new Error('Refusing webhook fixture SQL outside the maintenance database.')
    }
    return await fn(client)
  } finally {
    client.release()
    await maintenance.end()
  }
}

function subscriptionFor(userId: string, priceId: string, subscriptionId: string) {
  return {
    id: subscriptionId,
    object: 'subscription',
    status: 'active',
    customer: `cus_${subscriptionId}`,
    cancel_at_period_end: false,
    metadata: { user_id: userId, product_tier: 'inner_circle' },
    current_period_start: PERIOD_START,
    current_period_end: PERIOD_END,
    items: {
      object: 'list',
      data: [
        {
          id: `si_${subscriptionId}`,
          object: 'subscription_item',
          price: { id: priceId, object: 'price' },
          current_period_start: PERIOD_START,
          current_period_end: PERIOD_END,
        },
      ],
    },
  }
}

function eventPayload(input: {
  id: string
  type: 'checkout.session.completed' | 'invoice.paid'
  created: number
  userId: string
  subscriptionId: string
  paymentStatus?: string
  billingReason?: string
}) {
  const data =
    input.type === 'checkout.session.completed'
      ? {
          id: `cs_${input.id}`,
          object: 'checkout.session',
          mode: 'subscription',
          payment_status: input.paymentStatus ?? 'paid',
          client_reference_id: input.userId,
          subscription: input.subscriptionId,
          metadata: { user_id: input.userId, product_tier: 'inner_circle' },
        }
      : {
          id: `in_${input.id}`,
          object: 'invoice',
          billing_reason: input.billingReason ?? 'subscription_create',
          subscription: input.subscriptionId,
          metadata: { user_id: input.userId },
        }
  return JSON.stringify({
    id: input.id,
    object: 'event',
    api_version: '2024-06-20',
    created: input.created,
    type: input.type,
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    data: { object: data },
  })
}

async function postSigned(payload: string) {
  const signature = stripeHolder.current!.webhooks.generateTestHeaderString({
    payload,
    secret: webhookSecret,
  })
  return POST(
    new Request('http://127.0.0.1/api/stripe/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': signature,
      },
      body: payload,
    })
  )
}

async function cycleRows(userId: string) {
  const result = await pool!.query(
    `select credits_granted, circle_social_credits_granted, guest_invites_granted, is_active
     from public.membership_entitlement_cycles
     where user_id = $1`,
    [userId]
  )
  return result.rows
}

async function ledgerCount(eventId?: string) {
  const result = eventId
    ? await pool!.query(
        'select count(*)::int as count from public.stripe_webhook_events where event_id = $1',
        [eventId]
      )
    : await pool!.query('select count(*)::int as count from public.stripe_webhook_events')
  return Number(result.rows[0].count)
}

beforeAll(async () => {
  if ((process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').includes('jjjskyitlvjvxabkyipa')) {
    throw new Error('Refusing webhook tests: production Supabase URL is set.')
  }
  const target = assertCircleEntitlementDestructiveTestAllowed()
  await withMaintenance(target, async (client) => {
    await client.query(`
      select pg_terminate_backend(pid)
      from pg_stat_activity
      where datname = 'hsc_circle_entitlement_test'
        and pid <> pg_backend_pid()
    `)
    await client.query('drop database if exists hsc_circle_entitlement_test')
    await client.query('create database hsc_circle_entitlement_test')
  })
  disposableReady = true
  pool = new Pool({ connectionString: target.databaseUrl, max: 4 })
  const current = await pool.query('select current_database() as name')
  if (String(current.rows[0]?.name ?? '') !== CIRCLE_ENTITLEMENT_TEST_DATABASE_NAME) {
    throw new Error('Refusing webhook fixture SQL outside the disposable database.')
  }
  await pool.query(`
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'service_role') then
        create role service_role nologin;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon nologin;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin;
      end if;
    end
    $$;
    create table public.profiles (
      id uuid primary key,
      role text,
      membership_billing jsonb not null default '{}'::jsonb,
      updated_at timestamptz
    );
    create table public.stripe_webhook_events (
      event_id text primary key,
      event_type text not null,
      processed_at timestamptz not null default now()
    );
    create table public.membership_entitlement_cycles (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references public.profiles (id) on delete cascade,
      product_tier text not null
        check (product_tier = any (array['inner_circle'::text, 'elite_circle'::text])),
      period_start timestamptz not null,
      period_end timestamptz not null,
      credits_granted integer,
      credits_used integer not null default 0,
      guest_invites_granted integer not null default 0,
      guest_invites_used integer not null default 0,
      circle_social_credits_granted integer,
      circle_social_credits_used integer not null default 0,
      is_active boolean not null default true,
      created_at timestamptz not null default now(),
      constraint membership_entitlement_cycles_credits_nonneg check (credits_used >= 0),
      constraint membership_entitlement_cycles_inner_credits check (
        product_tier <> 'inner_circle' or (credits_granted is not null and credits_granted >= 0)
      ),
      constraint membership_entitlement_cycles_circle_social_nonneg
        check (circle_social_credits_used >= 0),
      constraint membership_entitlement_cycles_guest_nonneg check (guest_invites_used >= 0)
    );
  `)
  await pool.query(readFileSync(MIGRATION_PATH, 'utf8'))
  for (const id of [
    USER_PAID,
    USER_UNPAID,
    USER_ORDER_A,
    USER_ORDER_B,
    USER_RETRY,
    USER_NEW_INNER,
    USER_NEW_ELITE,
    USER_LEGACY_RENEW,
  ]) {
    await pool.query('insert into public.profiles (id, role) values ($1, $2)', [id, 'member'])
  }
  const stripe = new Stripe('sk_test_isolated_membership_webhook')
  stripe.subscriptions.retrieve = vi.fn(async (id: string) => {
    const known = catalog.get(id)
    if (!known) throw new Error(`unexpected subscription retrieve: ${id}`)
    return known as never
  }) as unknown as Stripe['subscriptions']['retrieve']
  stripeHolder.current = stripe
  adminHolder.current = adminClient(pool)
})

const catalog = new Map<string, ReturnType<typeof subscriptionFor>>()

afterAll(async () => {
  stripeHolder.current = null
  adminHolder.current = null
  if (pool) {
    await pool.end()
    pool = null
  }
  if (!disposableReady) return
  const target = assertCircleEntitlementDestructiveTestAllowed()
  await withMaintenance(target, async (client) => {
    await client.query(`
      select pg_terminate_backend(pid)
      from pg_stat_activity
      where datname = 'hsc_circle_entitlement_test'
        and pid <> pg_backend_pid()
    `)
    await client.query('drop database if exists hsc_circle_entitlement_test')
  })
})

it('fulfills one legacy cycle from a signed paid checkout and ignores the duplicate event', async () => {
  catalog.set('sub_paid', subscriptionFor(USER_PAID, LIVE_INNER, 'sub_paid'))
  const payload = eventPayload({
    id: 'evt_paid_initial',
    type: 'checkout.session.completed',
    created: 1_761_955_200,
    userId: USER_PAID,
    subscriptionId: 'sub_paid',
    paymentStatus: 'paid',
  })
  const first = await postSigned(payload)
  expect(first.status).toBe(200)
  expect(await first.json()).toEqual({ received: true })
  const second = await postSigned(payload)
  expect(second.status).toBe(200)
  expect(await second.json()).toEqual({ received: true, duplicate: true })
  const rows = await cycleRows(USER_PAID)
  expect(rows).toEqual([
    {
      credits_granted: 1,
      circle_social_credits_granted: 2,
      guest_invites_granted: 0,
      is_active: true,
    },
  ])
  expect(await ledgerCount('evt_paid_initial')).toBe(1)
})

it('records an unpaid checkout without opening a cycle', async () => {
  catalog.set('sub_unpaid', subscriptionFor(USER_UNPAID, LIVE_INNER, 'sub_unpaid'))
  const response = await postSigned(
    eventPayload({
      id: 'evt_unpaid_checkout',
      type: 'checkout.session.completed',
      created: 1_761_955_210,
      userId: USER_UNPAID,
      subscriptionId: 'sub_unpaid',
      paymentStatus: 'unpaid',
    })
  )
  expect(response.status).toBe(200)
  expect(await cycleRows(USER_UNPAID)).toEqual([])
  expect(await ledgerCount('evt_unpaid_checkout')).toBe(1)
})

it('opens one cycle when checkout and the initial invoice arrive in either order', async () => {
  catalog.set('sub_order_a', subscriptionFor(USER_ORDER_A, LIVE_INNER, 'sub_order_a'))
  catalog.set('sub_order_b', subscriptionFor(USER_ORDER_B, LIVE_INNER, 'sub_order_b'))
  const checkoutFirst = await postSigned(
    eventPayload({
      id: 'evt_order_a_checkout',
      type: 'checkout.session.completed',
      created: 1_761_955_220,
      userId: USER_ORDER_A,
      subscriptionId: 'sub_order_a',
    })
  )
  const invoiceSecond = await postSigned(
    eventPayload({
      id: 'evt_order_a_invoice',
      type: 'invoice.paid',
      created: 1_761_955_221,
      userId: USER_ORDER_A,
      subscriptionId: 'sub_order_a',
      billingReason: 'subscription_create',
    })
  )
  expect(checkoutFirst.status).toBe(200)
  expect(invoiceSecond.status).toBe(200)
  expect(await cycleRows(USER_ORDER_A)).toHaveLength(1)

  const invoiceFirst = await postSigned(
    eventPayload({
      id: 'evt_order_b_invoice',
      type: 'invoice.paid',
      created: 1_761_955_230,
      userId: USER_ORDER_B,
      subscriptionId: 'sub_order_b',
      billingReason: 'subscription_create',
    })
  )
  const checkoutSecond = await postSigned(
    eventPayload({
      id: 'evt_order_b_checkout',
      type: 'checkout.session.completed',
      created: 1_761_955_231,
      userId: USER_ORDER_B,
      subscriptionId: 'sub_order_b',
    })
  )
  expect(invoiceFirst.status).toBe(200)
  expect(checkoutSecond.status).toBe(200)
  expect(await cycleRows(USER_ORDER_B)).toHaveLength(1)
  expect(await ledgerCount('evt_order_a_checkout')).toBe(1)
  expect(await ledgerCount('evt_order_a_invoice')).toBe(1)
  expect(await ledgerCount('evt_order_b_invoice')).toBe(1)
  expect(await ledgerCount('evt_order_b_checkout')).toBe(1)
})

it('fulfills a signed event once after the first attempt fails', async () => {
  catalog.set(
    'sub_retry',
    subscriptionFor(USER_RETRY, 'price_unmapped_token', 'sub_retry')
  )
  const payload = eventPayload({
    id: 'evt_retry_fulfillment',
    type: 'checkout.session.completed',
    created: 1_761_955_240,
    userId: USER_RETRY,
    subscriptionId: 'sub_retry',
  })
  const failed = await postSigned(payload)
  expect(failed.status).toBe(500)
  expect(await cycleRows(USER_RETRY)).toEqual([])
  expect(await ledgerCount('evt_retry_fulfillment')).toBe(0)

  catalog.set('sub_retry', subscriptionFor(USER_RETRY, LIVE_INNER, 'sub_retry'))
  const recovered = await postSigned(payload)
  expect(recovered.status).toBe(200)
  expect(await cycleRows(USER_RETRY)).toHaveLength(1)
  expect(await ledgerCount('evt_retry_fulfillment')).toBe(1)

  const duplicate = await postSigned(payload)
  expect(await duplicate.json()).toEqual({ received: true, duplicate: true })
  expect(await cycleRows(USER_RETRY)).toHaveLength(1)
})

it('fulfills the live new prices from signed events and keeps a legacy renewal', async () => {
  const newInner = NEW_PURCHASE_STRIPE_PRICE_IDS.inner_circle
  const newElite = NEW_PURCHASE_STRIPE_PRICE_IDS.elite_circle
  if (!newInner || !newElite) throw new Error('new purchase prices are not mapped')
  catalog.set('sub_new_inner', subscriptionFor(USER_NEW_INNER, newInner, 'sub_new_inner'))
  catalog.set('sub_new_elite', subscriptionFor(USER_NEW_ELITE, newElite, 'sub_new_elite'))
  catalog.set(
    'sub_legacy_renew',
    subscriptionFor(USER_LEGACY_RENEW, STRIPE_LIVE_PRICE_IDS.inner_circle, 'sub_legacy_renew')
  )

  const innerCheckout = await postSigned(
    eventPayload({
      id: 'evt_new_inner_checkout',
      type: 'checkout.session.completed',
      created: 1_761_955_300,
      userId: USER_NEW_INNER,
      subscriptionId: 'sub_new_inner',
      paymentStatus: 'paid',
    })
  )
  expect(innerCheckout.status).toBe(200)
  expect(await cycleRows(USER_NEW_INNER)).toEqual([
    {
      credits_granted: 0,
      circle_social_credits_granted: 0,
      guest_invites_granted: 0,
      is_active: true,
    },
  ])

  const eliteRenewal = await postSigned(
    eventPayload({
      id: 'evt_new_elite_renewal',
      type: 'invoice.paid',
      created: 1_761_955_310,
      userId: USER_NEW_ELITE,
      subscriptionId: 'sub_new_elite',
      billingReason: 'subscription_cycle',
    })
  )
  expect(eliteRenewal.status).toBe(200)
  expect(await cycleRows(USER_NEW_ELITE)).toEqual([
    {
      credits_granted: 1,
      circle_social_credits_granted: 2,
      guest_invites_granted: 0,
      is_active: true,
    },
  ])

  const legacyRenewal = await postSigned(
    eventPayload({
      id: 'evt_legacy_inner_renewal',
      type: 'invoice.paid',
      created: 1_761_955_320,
      userId: USER_LEGACY_RENEW,
      subscriptionId: 'sub_legacy_renew',
      billingReason: 'subscription_cycle',
    })
  )
  expect(legacyRenewal.status).toBe(200)
  expect(await cycleRows(USER_LEGACY_RENEW)).toEqual([
    {
      credits_granted: 1,
      circle_social_credits_granted: 2,
      guest_invites_granted: 0,
      is_active: true,
    },
  ])
})
