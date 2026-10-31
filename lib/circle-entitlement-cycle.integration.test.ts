import { readFileSync } from 'node:fs'
import path from 'node:path'
import { Pool, type PoolClient, type QueryResult } from 'pg'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { STRIPE_LIVE_PRICE_IDS } from '@/lib/stripe/config'
import {
  openCircleCycleForStripePrice,
  UnmappedMembershipPriceError,
  checkoutPaymentSettlesMembership,
  entitlementOpenForInvoiceBillingReason,
} from '@/lib/stripe/circle-fulfillment'
import {
  consumeCircleSocialCredit,
  consumeEventCredit,
  consumeGuestInvite,
  returnCircleSocialCredit,
  returnEventCredit,
  returnGuestInvite,
} from '@/lib/membership-billing-cycles'
import {
  assertCircleEntitlementDestructiveTestAllowed,
  CIRCLE_ENTITLEMENT_MAINTENANCE_DATABASE,
  CIRCLE_ENTITLEMENT_TEST_DATABASE_NAME,
  circleEntitlementMaintenanceDatabaseUrl,
  type CircleEntitlementTestTarget,
} from '@/lib/circle-entitlement-db-guard'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => null,
}))

const MIGRATION_PATH = path.join(
  process.cwd(),
  'supabase/migrations/20261028230000_entitlement_cycle_atomic_replace.sql'
)

const USER_SOCIAL = '11111111-1111-4111-8111-111111111111'
const USER_PREMIUM = '22222222-2222-4222-8222-222222222222'
const USER_RETURN = '33333333-3333-4333-8333-333333333333'
const USER_PERIOD = '44444444-4444-4444-8444-444444444444'
const USER_FAIL = '55555555-5555-4555-8555-555555555555'
const USER_ORDER = '66666666-6666-4666-8666-666666666666'
const USER_REVERSE = '77777777-7777-4777-8777-777777777777'
const USER_LEGACY = '88888888-8888-4888-8888-888888888888'
const USER_UNKNOWN = '99999999-9999-4999-8999-999999999999'
const USER_UNPAID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
const USER_GUEST = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
const USER_ELITE = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3'
const USER_RPC = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd4'

const FUTURE_ELITE = 'future-elite-price-slot'
const futurePrices = { [FUTURE_ELITE]: 'elite_new' as const }

const COLUMNS = new Set([
  'id',
  'user_id',
  'product_tier',
  'period_start',
  'period_end',
  'credits_granted',
  'credits_used',
  'guest_invites_granted',
  'guest_invites_used',
  'circle_social_credits_granted',
  'circle_social_credits_used',
  'is_active',
  'created_at',
])

type Filter = { column: string; op: '=' | '<='; value: unknown }

class TableQuery implements PromiseLike<{ data: null; error: null }> {
  private action: 'select' | 'update' | 'insert' = 'select'
  private columns = '*'
  private filters: Filter[] = []
  private orderBy: { column: string; ascending: boolean } | null = null
  private limitCount: number | null = null
  private payload: Record<string, unknown> | null = null
  private returning = false

  constructor(
    private readonly pool: Pool,
    private readonly table: string
  ) {}

  select(columns?: string) {
    this.columns = columns && columns.length > 0 ? columns : '*'
    if (this.action !== 'select') this.returning = true
    return this
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, op: '=', value: this.assertColumn(column, value) })
    return this
  }

  lte(column: string, value: unknown) {
    this.filters.push({ column, op: '<=', value: this.assertColumn(column, value) })
    return this
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.assertColumn(column, null)
    this.orderBy = { column, ascending: options?.ascending !== false }
    return this
  }

  limit(count: number) {
    this.limitCount = count
    return this
  }

  update(payload: Record<string, unknown>) {
    this.action = 'update'
    this.payload = payload
    return this
  }

  insert(payload: Record<string, unknown>) {
    this.action = 'insert'
    this.payload = payload
    return this
  }

  maybeSingle() {
    return this.execute('maybe')
  }

  single() {
    return this.execute('one')
  }

  then<TResult1 = { data: null; error: null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: null; error: null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute('none').then(onfulfilled, onrejected)
  }

  private assertColumn(column: string, value: unknown) {
    if (!COLUMNS.has(column)) throw new Error(`Unexpected column ${column}`)
    return value
  }

  private async execute(mode: 'maybe' | 'one' | 'none') {
    if (this.table !== 'membership_entitlement_cycles') {
      return {
        data: null,
        error: { message: `Unexpected table ${this.table}`, code: '42P01' },
      }
    }

    const values: unknown[] = []
    const where = this.filters
      .map((filter) => {
        values.push(filter.value)
        return `${filter.column} ${filter.op} $${values.length}`
      })
      .join(' and ')

    let sql = ''
    if (this.action === 'select') {
      sql = `select ${this.columnList()} from public.membership_entitlement_cycles`
      if (where) sql += ` where ${where}`
      if (this.orderBy) {
        sql += ` order by ${this.orderBy.column} ${this.orderBy.ascending ? 'asc' : 'desc'}`
      }
      if (this.limitCount != null) sql += ` limit ${Number(this.limitCount)}`
    } else if (this.action === 'update' && this.payload) {
      const sets = Object.keys(this.payload).map((column) => {
        this.assertColumn(column, null)
        values.push(this.payload?.[column])
        return `${column} = $${values.length}`
      })
      sql = `update public.membership_entitlement_cycles set ${sets.join(', ')}`
      if (where) sql += ` where ${where}`
      if (this.returning) sql += ` returning ${this.columnList()}`
    } else if (this.action === 'insert' && this.payload) {
      const keys = Object.keys(this.payload)
      keys.forEach((column) => this.assertColumn(column, null))
      const placeholders = keys.map((column) => {
        values.push(this.payload?.[column])
        return `$${values.length}`
      })
      sql = `insert into public.membership_entitlement_cycles (${keys.join(', ')}) values (${placeholders.join(', ')})`
      if (this.returning) sql += ` returning ${this.columnList()}`
    } else {
      return { data: null, error: { message: 'Unsupported query', code: '42601' } }
    }

    try {
      const result = await this.pool.query(sql, values)
      return project(result, mode)
    } catch (error) {
      const coded = error as { message?: string; code?: string }
      return {
        data: null,
        error: {
          message: coded.message ?? 'query failed',
          code: coded.code,
        },
      }
    }
  }

  private columnList() {
    if (this.columns.trim() === '*') return '*'
    return this.columns
      .split(',')
      .map((column) => {
        const name = column.trim()
        this.assertColumn(name, null)
        return name
      })
      .join(', ')
  }
}

function project(result: QueryResult, mode: 'maybe' | 'one' | 'none') {
  if (mode === 'none') return { data: null, error: null }
  const rows = result.rows
  if (mode === 'maybe') {
    return { data: rows[0] ?? null, error: null }
  }
  if (rows.length !== 1) {
    return {
      data: null,
      error: { message: 'Entitlement cycle not found.', code: 'PGRST116' },
    }
  }
  return { data: rows[0], error: null }
}

function clientFor(pool: Pool) {
  return {
    from(table: string) {
      return new TableQuery(pool, table)
    },
    async rpc(name: string, args: Record<string, unknown>) {
      if (name !== 'replace_membership_entitlement_cycle') {
        return {
          data: null,
          error: { message: `unexpected rpc ${name}`, code: 'PGRST202' },
        }
      }
      try {
        const result = await pool.query(
          `select public.replace_membership_entitlement_cycle(
            $1::uuid, $2::text, $3::timestamptz, $4::timestamptz, $5::integer, $6::integer, $7::integer
          ) as cycle`,
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
      } catch (error) {
        const coded = error as { message?: string; code?: string }
        return {
          data: null,
          error: { message: coded.message ?? 'rpc failed', code: coded.code },
        }
      }
    },
  }
}

let pool: Pool | null = null
let disposableReady = false

function db() {
  if (!pool) throw new Error('disposable entitlement database is not connected')
  return clientFor(pool) as never
}

async function withMaintenance<T>(
  target: CircleEntitlementTestTarget,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const allowed = assertCircleEntitlementDestructiveTestAllowed()
  if (allowed.databaseName !== target.databaseName) {
    throw new Error('Refusing destructive entitlement SQL: target changed before connect.')
  }
  const maintenance = new Pool({
    connectionString: circleEntitlementMaintenanceDatabaseUrl(allowed),
    max: 1,
  })
  const client = await maintenance.connect()
  try {
    const current = await client.query('select current_database() as name')
    const name = String(current.rows[0]?.name ?? '')
    if (
      name !== CIRCLE_ENTITLEMENT_MAINTENANCE_DATABASE ||
      name === CIRCLE_ENTITLEMENT_TEST_DATABASE_NAME
    ) {
      throw new Error(
        'Refusing destructive entitlement SQL: maintenance connection is not the postgres database.'
      )
    }
    return await fn(client)
  } finally {
    client.release()
    await maintenance.end()
  }
}

async function query(sql: string, values: unknown[] = []) {
  if (!pool) throw new Error('disposable entitlement database is not connected')
  return pool.query(sql, values)
}

async function queryAsRole(role: 'anon' | 'authenticated' | 'service_role', sql: string, values: unknown[] = []) {
  if (!pool) throw new Error('disposable entitlement database is not connected')
  const client = await pool.connect()
  try {
    await client.query(`set role ${role}`)
    return await client.query(sql, values)
  } finally {
    await client.query('reset role')
    client.release()
  }
}

async function rowsFor(userId: string) {
  const result = await query(
    `select id, product_tier, credits_granted, credits_used,
            guest_invites_granted, guest_invites_used,
            circle_social_credits_granted, circle_social_credits_used,
            is_active, period_start
     from public.membership_entitlement_cycles
     where user_id = $1
     order by period_start`,
    [userId]
  )
  return result.rows
}

const PERIOD_A = {
  start: new Date('2026-10-01T00:00:00.000Z'),
  end: new Date('2026-11-01T00:00:00.000Z'),
}
const PERIOD_B = {
  start: new Date('2026-11-01T00:00:00.000Z'),
  end: new Date('2026-12-01T00:00:00.000Z'),
}

beforeAll(async () => {
  if ((process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').includes('jjjskyitlvjvxabkyipa')) {
    throw new Error('Refusing entitlement tests: production Supabase URL is set.')
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
  pool = new Pool({ connectionString: target.databaseUrl, max: 12 })
  const current = await query('select current_database() as name')
  if (String(current.rows[0]?.name ?? '') !== CIRCLE_ENTITLEMENT_TEST_DATABASE_NAME) {
    throw new Error(
      'Refusing fixture SQL: connected database is not the disposable test database.'
    )
  }
  await query(`
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'service_role') then
        create role service_role nologin bypassrls;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon nologin;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin;
      end if;
    end
    $$;
    alter role service_role bypassrls;
  `)
  await query(`
    create table public.profiles (
      id uuid primary key,
      email text unique,
      membership_billing jsonb not null default '{}'::jsonb
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
      constraint membership_entitlement_cycles_credits_nonneg
        check (credits_used >= 0),
      constraint membership_entitlement_cycles_inner_credits
        check (
          product_tier <> 'inner_circle'
          or (credits_granted is not null and credits_granted >= 0)
        ),
      constraint membership_entitlement_cycles_circle_social_nonneg
        check (circle_social_credits_used >= 0),
      constraint membership_entitlement_cycles_guest_nonneg
        check (guest_invites_used >= 0)
    );
    alter table public.membership_entitlement_cycles enable row level security;
  `)
  await query(readFileSync(MIGRATION_PATH, 'utf8'))
  await query(`
    grant usage on schema public to service_role, anon, authenticated;
    grant select, insert, update, delete on public.membership_entitlement_cycles to service_role;
    grant select, insert, update on public.profiles to service_role;
  `)
  const users = [
    USER_SOCIAL,
    USER_PREMIUM,
    USER_RETURN,
    USER_PERIOD,
    USER_FAIL,
    USER_ORDER,
    USER_REVERSE,
    USER_LEGACY,
    USER_UNKNOWN,
    USER_UNPAID,
    USER_GUEST,
    USER_ELITE,
    USER_RPC,
  ]
  for (const id of users) {
    await query('insert into public.profiles (id) values ($1)', [id])
  }
})

afterAll(async () => {
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
  disposableReady = false
})

it('lets only one of two requests spend the last Circle Social credit', async () => {
  const opened = await openCircleCycleForStripePrice(db(), {
    userId: USER_SOCIAL,
    priceId: FUTURE_ELITE,
    additionalPrices: futurePrices,
    periodStart: PERIOD_A.start,
    periodEnd: PERIOD_A.end,
  })
  expect(opened.opened).toBe(true)
  if (!opened.opened) return
  await query(
    `update public.membership_entitlement_cycles
     set circle_social_credits_granted = 1, circle_social_credits_used = 0
     where id = $1`,
    [opened.cycle.id]
  )

  const [first, second] = await Promise.allSettled([
    consumeCircleSocialCredit(db(), opened.cycle.id),
    consumeCircleSocialCredit(db(), opened.cycle.id),
  ])
  const fulfilled = [first, second].filter((result) => result.status === 'fulfilled')
  const rejected = [first, second].filter((result) => result.status === 'rejected')
  expect(fulfilled).toHaveLength(1)
  expect(rejected).toHaveLength(1)

  const rows = await rowsFor(USER_SOCIAL)
  expect(rows).toHaveLength(1)
  expect(rows[0].circle_social_credits_granted).toBe(1)
  expect(rows[0].circle_social_credits_used).toBe(1)
})

it('lets only one of two requests spend the last premium-event credit', async () => {
  const opened = await openCircleCycleForStripePrice(db(), {
    userId: USER_PREMIUM,
    priceId: FUTURE_ELITE,
    additionalPrices: futurePrices,
    periodStart: PERIOD_A.start,
    periodEnd: PERIOD_A.end,
  })
  expect(opened.opened).toBe(true)
  if (!opened.opened) return
  await query(
    `update public.membership_entitlement_cycles
     set credits_granted = 1, credits_used = 0
     where id = $1`,
    [opened.cycle.id]
  )

  const [first, second] = await Promise.allSettled([
    consumeEventCredit(db(), opened.cycle.id),
    consumeEventCredit(db(), opened.cycle.id),
  ])
  expect([first, second].filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  expect([first, second].filter((result) => result.status === 'rejected')).toHaveLength(1)

  const rows = await rowsFor(USER_PREMIUM)
  expect(rows[0].credits_granted).toBe(1)
  expect(rows[0].credits_used).toBe(1)
})

it('returns a credit at most once when cancellation is repeated concurrently', async () => {
  const opened = await openCircleCycleForStripePrice(db(), {
    userId: USER_RETURN,
    priceId: STRIPE_LIVE_PRICE_IDS.inner_circle,
    periodStart: PERIOD_A.start,
    periodEnd: PERIOD_A.end,
  })
  expect(opened.opened).toBe(true)
  if (!opened.opened) return
  await consumeCircleSocialCredit(db(), opened.cycle.id)
  await consumeEventCredit(db(), opened.cycle.id)

  await Promise.all([
    returnCircleSocialCredit(db(), opened.cycle.id),
    returnCircleSocialCredit(db(), opened.cycle.id),
    returnEventCredit(db(), opened.cycle.id),
    returnEventCredit(db(), opened.cycle.id),
  ])
  await returnCircleSocialCredit(db(), opened.cycle.id)
  await returnEventCredit(db(), opened.cycle.id)

  const rows = await rowsFor(USER_RETURN)
  expect(rows).toHaveLength(1)
  expect(rows[0].circle_social_credits_granted).toBe(2)
  expect(rows[0].circle_social_credits_used).toBe(0)
  expect(rows[0].credits_granted).toBe(1)
  expect(rows[0].credits_used).toBe(0)
})

it('creates one cycle when the same period is opened concurrently', async () => {
  const opens = Array.from({ length: 8 }, () =>
    openCircleCycleForStripePrice(db(), {
      userId: USER_PERIOD,
      priceId: STRIPE_LIVE_PRICE_IDS.inner_circle,
      periodStart: PERIOD_A.start,
      periodEnd: PERIOD_A.end,
    })
  )
  const results = await Promise.all(opens)
  expect(results.every((result) => result.opened)).toBe(true)
  const rows = await rowsFor(USER_PERIOD)
  expect(rows).toHaveLength(1)
  expect(rows[0].is_active).toBe(true)
  expect(rows[0].credits_granted).toBe(1)
  expect(rows[0].circle_social_credits_granted).toBe(2)
  expect(rows[0].credits_used).toBe(0)
})

it('keeps the old cycle active when renewal fails before a replacement exists', async () => {
  const opened = await openCircleCycleForStripePrice(db(), {
    userId: USER_FAIL,
    priceId: STRIPE_LIVE_PRICE_IDS.elite_circle,
    periodStart: PERIOD_A.start,
    periodEnd: PERIOD_A.end,
  })
  expect(opened.opened).toBe(true)
  if (!opened.opened) return
  await query(
    `update public.membership_entitlement_cycles
     set credits_used = 1, guest_invites_used = 1
     where id = $1`,
    [opened.cycle.id]
  )
  await query(`
    alter table public.membership_entitlement_cycles
      add constraint circle_entitlement_test_reject_period
      check (period_end <> timestamptz '2099-01-01 00:00:00+00')
  `)
  try {
    await expect(
      openCircleCycleForStripePrice(db(), {
        userId: USER_FAIL,
        priceId: STRIPE_LIVE_PRICE_IDS.elite_circle,
        periodStart: PERIOD_B.start,
        periodEnd: new Date('2099-01-01T00:00:00.000Z'),
      })
    ).rejects.toThrow(/circle_entitlement_test_reject_period/)
    const during = await rowsFor(USER_FAIL)
    expect(during).toHaveLength(1)
    expect(during[0].is_active).toBe(true)
    expect(during[0].credits_granted).toBe(2)
    expect(during[0].credits_used).toBe(1)
    expect(during[0].guest_invites_granted).toBe(1)
    expect(during[0].guest_invites_used).toBe(1)
    expect(during[0].circle_social_credits_granted).toBeNull()
  } finally {
    await query(
      'alter table public.membership_entitlement_cycles drop constraint circle_entitlement_test_reject_period'
    )
  }

  const renewed = await openCircleCycleForStripePrice(db(), {
    userId: USER_FAIL,
    priceId: STRIPE_LIVE_PRICE_IDS.elite_circle,
    periodStart: PERIOD_B.start,
    periodEnd: PERIOD_B.end,
  })
  expect(renewed.opened).toBe(true)
  const rows = await rowsFor(USER_FAIL)
  expect(rows).toHaveLength(2)
  const previous = rows.find((row) => row.is_active === false)
  const current = rows.find((row) => row.is_active === true)
  expect(previous?.credits_used).toBe(1)
  expect(previous?.guest_invites_used).toBe(1)
  expect(previous?.credits_granted).toBe(2)
  expect(current?.credits_used).toBe(0)
  expect(current?.guest_invites_used).toBe(0)
  expect(current?.credits_granted).toBe(2)
  expect(current?.guest_invites_granted).toBe(1)
  expect(current?.circle_social_credits_granted).toBeNull()
})

it('fulfills a paid initial subscription once in either event order and ignores duplicates', async () => {
  expect(checkoutPaymentSettlesMembership('paid')).toBe(true)
  expect(entitlementOpenForInvoiceBillingReason('subscription_create')).toBe('initial')

  const checkoutFirst = await openCircleCycleForStripePrice(db(), {
    userId: USER_ORDER,
    priceId: STRIPE_LIVE_PRICE_IDS.inner_circle,
    periodStart: PERIOD_A.start,
    periodEnd: PERIOD_A.end,
  })
  const invoiceSecond = await openCircleCycleForStripePrice(db(), {
    userId: USER_ORDER,
    priceId: STRIPE_LIVE_PRICE_IDS.inner_circle,
    periodStart: PERIOD_A.start,
    periodEnd: PERIOD_A.end,
  })
  expect(checkoutFirst.opened && invoiceSecond.opened).toBe(true)
  if (checkoutFirst.opened && invoiceSecond.opened) {
    expect(invoiceSecond.cycle.id).toBe(checkoutFirst.cycle.id)
  }
  await query(
    `update public.membership_entitlement_cycles
     set credits_used = 1 where user_id = $1`,
    [USER_ORDER]
  )
  await openCircleCycleForStripePrice(db(), {
    userId: USER_ORDER,
    priceId: STRIPE_LIVE_PRICE_IDS.inner_circle,
    periodStart: PERIOD_A.start,
    periodEnd: PERIOD_A.end,
  })
  const kept = await rowsFor(USER_ORDER)
  expect(kept).toHaveLength(1)
  expect(kept[0].credits_used).toBe(1)

  const invoiceFirst = await openCircleCycleForStripePrice(db(), {
    userId: USER_REVERSE,
    priceId: STRIPE_LIVE_PRICE_IDS.elite_circle,
    periodStart: PERIOD_A.start,
    periodEnd: PERIOD_A.end,
  })
  const checkoutSecond = await openCircleCycleForStripePrice(db(), {
    userId: USER_REVERSE,
    priceId: STRIPE_LIVE_PRICE_IDS.elite_circle,
    periodStart: PERIOD_A.start,
    periodEnd: PERIOD_A.end,
  })
  expect(invoiceFirst.opened && checkoutSecond.opened).toBe(true)
  expect(await rowsFor(USER_REVERSE)).toHaveLength(1)

  const concurrent = await Promise.all([
    openCircleCycleForStripePrice(db(), {
      userId: USER_ORDER,
      priceId: STRIPE_LIVE_PRICE_IDS.inner_circle,
      periodStart: PERIOD_B.start,
      periodEnd: PERIOD_B.end,
    }),
    openCircleCycleForStripePrice(db(), {
      userId: USER_ORDER,
      priceId: STRIPE_LIVE_PRICE_IDS.inner_circle,
      periodStart: PERIOD_B.start,
      periodEnd: PERIOD_B.end,
    }),
  ])
  expect(concurrent.every((result) => result.opened)).toBe(true)
  const renewed = await rowsFor(USER_ORDER)
  expect(renewed.filter((row) => row.is_active)).toHaveLength(1)
  const active = renewed.find((row) => row.is_active)
  expect(active?.credits_granted).toBe(1)
  expect(active?.circle_social_credits_granted).toBe(2)
  expect(active?.credits_used).toBe(0)
  const expired = renewed.find((row) => !row.is_active)
  expect(expired?.credits_used).toBe(1)
  expect(expired?.credits_granted).toBe(1)
})

it('does not issue a cycle for unpaid checkout and preserves a legacy renewal package', async () => {
  expect(checkoutPaymentSettlesMembership('unpaid')).toBe(false)
  expect(checkoutPaymentSettlesMembership(null)).toBe(false)
  expect(entitlementOpenForInvoiceBillingReason('subscription_update')).toBeNull()
  if (!checkoutPaymentSettlesMembership('unpaid')) {
    expect(await rowsFor(USER_UNPAID)).toHaveLength(0)
  }
  const paidLater = await openCircleCycleForStripePrice(db(), {
    userId: USER_UNPAID,
    priceId: STRIPE_LIVE_PRICE_IDS.inner_circle,
    periodStart: PERIOD_A.start,
    periodEnd: PERIOD_A.end,
  })
  expect(paidLater.opened).toBe(true)

  const legacy = await openCircleCycleForStripePrice(db(), {
    userId: USER_LEGACY,
    priceId: STRIPE_LIVE_PRICE_IDS.inner_circle,
    periodStart: PERIOD_A.start,
    periodEnd: PERIOD_A.end,
  })
  expect(legacy.opened).toBe(true)
  if (!legacy.opened) return
  await query(
    `update public.membership_entitlement_cycles
     set credits_used = 1, circle_social_credits_used = 2
     where id = $1`,
    [legacy.cycle.id]
  )
  await openCircleCycleForStripePrice(db(), {
    userId: USER_LEGACY,
    priceId: STRIPE_LIVE_PRICE_IDS.inner_circle,
    periodStart: PERIOD_B.start,
    periodEnd: PERIOD_B.end,
  })
  const rows = await rowsFor(USER_LEGACY)
  const previous = rows.find((row) => !row.is_active)
  const current = rows.find((row) => row.is_active)
  expect(previous?.credits_granted).toBe(1)
  expect(previous?.credits_used).toBe(1)
  expect(previous?.circle_social_credits_used).toBe(2)
  expect(current?.credits_granted).toBe(1)
  expect(current?.circle_social_credits_granted).toBe(2)
  expect(current?.guest_invites_granted).toBe(0)
  expect(current?.credits_used).toBe(0)
})

it('rejects an unknown price without writing a guessed cycle', async () => {
  await expect(
    openCircleCycleForStripePrice(db(), {
      userId: USER_UNKNOWN,
      priceId: 'unmapped-price-token',
      periodStart: PERIOD_A.start,
      periodEnd: PERIOD_A.end,
    })
  ).rejects.toBeInstanceOf(UnmappedMembershipPriceError)
  expect(await rowsFor(USER_UNKNOWN)).toHaveLength(0)

  const connect = await openCircleCycleForStripePrice(db(), {
    userId: USER_UNKNOWN,
    priceId: STRIPE_LIVE_PRICE_IDS.connect,
    periodStart: PERIOD_A.start,
    periodEnd: PERIOD_A.end,
  })
  expect(connect).toEqual({ opened: false, reason: 'not_circle' })
  expect(await rowsFor(USER_UNKNOWN)).toHaveLength(0)
})

it('meters a new Elite package and still redeems a legacy guest invitation', async () => {
  const elite = await openCircleCycleForStripePrice(db(), {
    userId: USER_ELITE,
    priceId: FUTURE_ELITE,
    additionalPrices: futurePrices,
    periodStart: PERIOD_A.start,
    periodEnd: PERIOD_A.end,
  })
  expect(elite.opened).toBe(true)
  if (!elite.opened) return
  expect(elite.cycle.circle_social_credits_granted).toBe(2)
  expect(elite.cycle.credits_granted).toBe(1)
  expect(elite.cycle.guest_invites_granted).toBe(0)
  await consumeCircleSocialCredit(db(), elite.cycle.id)
  await consumeCircleSocialCredit(db(), elite.cycle.id)
  await expect(consumeCircleSocialCredit(db(), elite.cycle.id)).rejects.toThrow(
    /No included|used your/
  )
  await consumeEventCredit(db(), elite.cycle.id)
  await expect(consumeEventCredit(db(), elite.cycle.id)).rejects.toThrow(/premium/)
  await expect(consumeGuestInvite(db(), elite.cycle.id)).rejects.toThrow(/guest invites/)
  const metered = await rowsFor(USER_ELITE)
  expect(metered[0].circle_social_credits_used).toBe(2)
  expect(metered[0].credits_used).toBe(1)
  expect(metered[0].guest_invites_used).toBe(0)
  expect(metered[0].guest_invites_granted).toBe(0)

  const guest = await openCircleCycleForStripePrice(db(), {
    userId: USER_GUEST,
    priceId: STRIPE_LIVE_PRICE_IDS.elite_circle,
    periodStart: PERIOD_A.start,
    periodEnd: PERIOD_A.end,
  })
  expect(guest.opened).toBe(true)
  if (!guest.opened) return
  expect(guest.cycle.guest_invites_granted).toBe(1)
  expect(guest.cycle.circle_social_credits_granted).toBeNull()
  await expect(consumeCircleSocialCredit(db(), guest.cycle.id)).rejects.toThrow(
    /not metered/
  )
  await consumeGuestInvite(db(), guest.cycle.id)
  await returnGuestInvite(db(), guest.cycle.id)
  await returnGuestInvite(db(), guest.cycle.id)
  const legacy = await rowsFor(USER_GUEST)
  expect(legacy[0].guest_invites_granted).toBe(1)
  expect(legacy[0].guest_invites_used).toBe(0)
  expect(legacy[0].circle_social_credits_used).toBe(0)
})

it('keeps replace_membership_entitlement_cycle executable only by service_role', async () => {
  const signature = await query(`
    select
      pg_get_function_identity_arguments(p.oid) as args,
      pg_get_userbyid(p.proowner) as owner,
      p.prosecdef as security_definer,
      p.proconfig as config,
      current_user as connected_as
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'replace_membership_entitlement_cycle'
  `)
  const fn = signature.rows[0]
  expect(fn.args).toBe(
    'p_user_id uuid, p_product_tier text, p_period_start timestamp with time zone, p_period_end timestamp with time zone, p_credits_granted integer, p_guest_invites_granted integer, p_circle_social_credits_granted integer'
  )
  expect(fn.owner).toBe(fn.connected_as)
  expect(fn.security_definer).toBe(false)
  expect(fn.config).toContain('search_path=public')

  const privileges = await query(`
    select
      has_function_privilege(
        'public',
        'public.replace_membership_entitlement_cycle(uuid,text,timestamptz,timestamptz,integer,integer,integer)',
        'execute'
      ) as public_execute,
      has_function_privilege(
        'anon',
        'public.replace_membership_entitlement_cycle(uuid,text,timestamptz,timestamptz,integer,integer,integer)',
        'execute'
      ) as anon_execute,
      has_function_privilege(
        'authenticated',
        'public.replace_membership_entitlement_cycle(uuid,text,timestamptz,timestamptz,integer,integer,integer)',
        'execute'
      ) as authenticated_execute,
      has_function_privilege(
        'service_role',
        'public.replace_membership_entitlement_cycle(uuid,text,timestamptz,timestamptz,integer,integer,integer)',
        'execute'
      ) as service_execute
  `)
  expect(privileges.rows[0]).toEqual({
    public_execute: false,
    anon_execute: false,
    authenticated_execute: false,
    service_execute: true,
  })

  const call = `
    select public.replace_membership_entitlement_cycle(
      '${USER_RPC}'::uuid,
      'elite_circle',
      '2026-10-01T00:00:00Z',
      '2026-11-01T00:00:00Z',
      7,
      3,
      9
    ) as cycle
  `
  await expect(queryAsRole('anon', call)).rejects.toThrow(/permission denied/i)
  await expect(queryAsRole('authenticated', call)).rejects.toThrow(/permission denied/i)

  const issued = await queryAsRole('service_role', call)
  const cycle = issued.rows[0].cycle
  expect(cycle.user_id).toBe(USER_RPC)
  expect(cycle.credits_granted).toBe(7)
  expect(cycle.guest_invites_granted).toBe(3)
  expect(cycle.circle_social_credits_granted).toBe(9)
  expect(await rowsFor(USER_RPC)).toHaveLength(1)

  const index = await query(`
    select indexdef
    from pg_indexes
    where indexname = 'membership_entitlement_cycles_user_period_uidx'
  `)
  expect(index.rows[0].indexdef).toContain('entitlement_period_second')
  expect(index.rows[0].indexdef).not.toContain('date_trunc')

  const column = await query(`
    select data_type, is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'membership_entitlement_cycles'
      and column_name = 'period_start'
  `)
  expect(column.rows[0]).toEqual({
    data_type: 'timestamp with time zone',
    is_nullable: 'NO',
  })

  const client = await pool!.connect()
  try {
    await client.query('begin')
    const seconds: number[] = []
    for (const zone of ['UTC', 'America/Chicago', 'Asia/Tokyo']) {
      await client.query(`set local time zone '${zone}'`)
      const result = await client.query(`
        select
          public.entitlement_period_second('2026-10-01T00:00:00.900Z'::timestamptz) as fractional,
          public.entitlement_period_second('2026-10-01T00:00:00.100Z'::timestamptz) as earlier_fraction,
          public.entitlement_period_second('2026-10-01T00:00:01.000Z'::timestamptz) as next_second,
          floor(extract(epoch from '2026-10-01T00:00:00.900Z'::timestamptz))::bigint as epoch_floor
      `)
      seconds.push(Number(result.rows[0].fractional))
      expect(Number(result.rows[0].fractional)).toBe(Number(result.rows[0].earlier_fraction))
      expect(Number(result.rows[0].next_second)).toBe(Number(result.rows[0].fractional) + 1)
      expect(Number(result.rows[0].fractional)).toBe(Number(result.rows[0].epoch_floor))
    }
    expect(new Set(seconds).size).toBe(1)
    await client.query('rollback')
  } finally {
    client.release()
  }
})
