import { readFileSync } from 'node:fs'
import path from 'node:path'
import { Client, type QueryResult } from 'pg'
import { afterAll, beforeAll, expect, it } from 'vitest'
import {
  buildMemberEntitlements,
  canUseMessaging,
} from '@/lib/membership-entitlements'
import type { SlimMembershipAccessOverride } from '@/lib/membership-access-override'
import { STRIPE_LIVE_PRICE_IDS } from '@/lib/stripe/config'
import {
  MESSAGING_POLICY_DATABASE_NAME,
  MESSAGING_POLICY_MAINTENANCE_DATABASE,
  assertMessagingPolicyTestAllowed,
  messagingPolicyMaintenanceDatabaseUrl,
  type MessagingPolicyTestTarget,
} from './messaging-policy-test-guard.ts'

/**
 * Disposable-database suite. Excluded from `npm test`.
 * Creates and drops only hsc_messaging_policy_test, and only after
 * current_database() on the maintenance connection is postgres.
 */

const PAID_A = '11111111-1111-4111-8111-111111111111'
const PAID_B = '22222222-2222-4222-8222-222222222222'
const UNPAID = '33333333-3333-4333-8333-333333333333'
const ADMIN = '44444444-4444-4444-8444-444444444444'
const AUTHOR = '66666666-6666-4666-8666-666666666666'
const RECIPIENT = '77777777-7777-4777-8777-777777777777'
const BYSTANDER = '88888888-8888-4888-8888-888888888888'

const FIXTURE_SQL = `
create schema if not exists auth;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.current_user_id', true), '')::uuid
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end
$$;

grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;

create table public.profiles (
  id uuid primary key,
  email text unique,
  full_name text,
  role text not null default 'member',
  application_status text not null default 'approved',
  membership_billing jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_admin(check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to public
set row_security to off
as $$
  select coalesce(
    (
      select role = 'admin'
      from public.profiles
      where id = check_user_id
      limit 1
    ),
    false
  );
$$;

revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated, service_role;

create table public.membership_access_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  tier text not null
    check (tier = any (array['inner_circle'::text, 'elite_circle'::text])),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  reason text,
  granted_by uuid not null references public.profiles (id) on delete restrict,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint membership_access_overrides_revoke_pair check (
    (revoked_at is null and revoked_by is null)
    or (revoked_at is not null and revoked_by is not null)
  ),
  constraint membership_access_overrides_expiry_after_start check (
    expires_at is null or expires_at > starts_at
  )
);

create unique index membership_access_overrides_one_active
  on public.membership_access_overrides (user_id)
  where revoked_at is null;

revoke all on public.membership_access_overrides from anon, authenticated;
grant all on public.membership_access_overrides to service_role;

create table public.member_conversations (
  id uuid primary key default gen_random_uuid(),
  participant_a uuid not null references public.profiles (id) on delete cascade,
  participant_b uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'accepted'
    check (status = any (array['pending'::text, 'accepted'::text, 'declined'::text])),
  updated_at timestamptz not null default now(),
  constraint member_conversations_ordered check (participant_a < participant_b),
  constraint member_conversations_distinct check (participant_a <> participant_b)
);

create table public.member_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.member_conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint member_messages_body_length check (char_length(trim(body)) > 0)
);

alter table public.member_conversations enable row level security;
alter table public.member_messages enable row level security;

create table public.member_vouches (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references public.profiles (id) on delete cascade,
  vouchee_id uuid not null references public.profiles (id) on delete cascade,
  vouch_type text not null,
  relationship_context text not null,
  note text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  moderated_at timestamptz,
  moderated_by uuid references public.profiles (id) on delete set null,
  moderation_reason text,
  constraint member_vouches_no_self check (voucher_id <> vouchee_id),
  constraint member_vouches_type_check check (
    vouch_type = any (array['personal'::text, 'professional'::text, 'community'::text])
  ),
  constraint member_vouches_status_check check (
    status = any (array['active'::text, 'removed'::text, 'flagged'::text])
  ),
  constraint member_vouches_unique_active unique (voucher_id, vouchee_id, vouch_type)
);

alter table public.member_vouches enable row level security;

create policy "Approved members create vouches"
  on public.member_vouches
  for insert
  to authenticated
  with check (
    voucher_id = (select auth.uid())
    and exists (
      select 1 from public.profiles voucher
      where voucher.id = voucher_id
        and voucher.application_status = 'approved'
    )
    and exists (
      select 1 from public.profiles vouchee
      where vouchee.id = vouchee_id
        and vouchee.application_status = 'approved'
    )
  );

create policy "Members read active vouches"
  on public.member_vouches
  for select
  to authenticated
  using (
    status = 'active'
    or voucher_id = (select auth.uid())
    or public.is_admin((select auth.uid()))
  );

create policy "Voucher or admin updates vouches"
  on public.member_vouches
  for update
  to authenticated
  using (
    voucher_id = (select auth.uid())
    or public.is_admin((select auth.uid()))
  )
  with check (
    voucher_id = (select auth.uid())
    or public.is_admin((select auth.uid()))
  );

grant usage on schema public to authenticated, service_role;
grant select on public.profiles to authenticated;
grant select, insert, update on public.member_conversations to authenticated;
grant select, insert, update on public.member_messages to authenticated;
grant select, insert, update, delete on public.member_vouches to authenticated;
grant select, update on public.profiles to service_role;
`

const TERMINATE_SQL = `
  select pg_terminate_backend(pid)
  from pg_stat_activity
  where datname = 'hsc_messaging_policy_test'
    and pid <> pg_backend_pid()
`
const DROP_SQL = 'drop database if exists hsc_messaging_policy_test'
const CREATE_SQL = 'create database hsc_messaging_policy_test'

let owner: Client | null = null
let testDatabaseUrl = ''
let databaseReady = false
let dbNow = new Date()

type BillingInput = {
  tier: string
  subscription_status: string
  cancel_at_period_end?: boolean
  billing_period_end?: string | null
  stripe_price_id?: string | null
  ended_paid_tier?: string | null
}

type OverrideInput = {
  tier: 'inner_circle' | 'elite_circle'
  startsAt: string
  expiresAt: string | null
  revokedAt: string | null
}

async function query(sql: string, values: unknown[] = []): Promise<QueryResult> {
  if (!owner) throw new Error('disposable test database is not connected')
  return owner.query(sql, values)
}

async function withMaintenance<T>(
  target: MessagingPolicyTestTarget,
  fn: (client: Client) => Promise<T>
): Promise<T> {
  const allowed = assertMessagingPolicyTestAllowed()
  if (
    allowed.databaseName !== target.databaseName ||
    allowed.databaseUrl !== target.databaseUrl
  ) {
    throw new Error('Refusing messaging-policy SQL: target changed before connect.')
  }
  const client = new Client({
    connectionString: messagingPolicyMaintenanceDatabaseUrl(allowed),
  })
  await client.connect()
  try {
    const current = await client.query('select current_database() as name')
    const name = String(current.rows[0]?.name ?? '')
    if (
      name !== MESSAGING_POLICY_MAINTENANCE_DATABASE ||
      name === MESSAGING_POLICY_DATABASE_NAME
    ) {
      throw new Error(
        'Refusing messaging-policy SQL: maintenance connection is not the postgres database.'
      )
    }
    return await fn(client)
  } finally {
    await client.end()
  }
}

async function asAuthenticated<T>(
  userId: string,
  fn: (client: Client) => Promise<T>
): Promise<T> {
  if (!testDatabaseUrl) throw new Error('disposable test database is not connected')
  const client = new Client({ connectionString: testDatabaseUrl })
  await client.connect()
  try {
    await client.query('begin')
    await client.query(`select set_config('app.current_user_id', $1, true)`, [
      userId,
    ])
    await client.query('set local role authenticated')
    await client.query('set local search_path = public, auth')
    const uid = await client.query('select auth.uid() as uid')
    if (uid.rows[0]?.uid !== userId) {
      throw new Error('authenticated context did not adopt the test user')
    }
    const result = await fn(client)
    await client.query('commit')
    return result
  } catch (error) {
    await client.query('rollback').catch(() => undefined)
    throw error
  } finally {
    await client.end()
  }
}

async function expectDenied(userId: string, sql: string, values: unknown[] = []) {
  try {
    const result = await asAuthenticated(userId, (client) => client.query(sql, values))
    expect(result.rowCount).toBe(0)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    expect(message).toMatch(/row-level security|permission denied/i)
  }
}

function appCanMessage(input: {
  billing: BillingInput
  role?: string
  accessOverride?: OverrideInput | null
}) {
  const override: SlimMembershipAccessOverride | null = input.accessOverride
    ? {
        tier: input.accessOverride.tier,
        startsAt: input.accessOverride.startsAt,
        expiresAt: input.accessOverride.expiresAt,
        revokedAt: input.accessOverride.revokedAt,
      }
    : null
  return canUseMessaging(
    buildMemberEntitlements({
      role: input.role ?? 'member',
      billing: input.billing,
      accessOverride: override,
      now: dbNow,
    })
  )
}

async function sqlBillingAllows(billing: BillingInput): Promise<boolean> {
  const result = await query(
    'select public.profile_billing_has_paid_messaging($1::jsonb) as allowed',
    [JSON.stringify(billing)]
  )
  return result.rows[0].allowed === true
}

async function insertProfile(input: {
  id: string
  role?: string
  billing?: BillingInput
  name: string
}) {
  await query(
    `insert into public.profiles (id, email, full_name, role, application_status, membership_billing)
     values ($1, $2, $3, $4, 'approved', $5::jsonb)`,
    [
      input.id,
      `${input.id}@messaging-policy.test`,
      input.name,
      input.role ?? 'member',
      JSON.stringify(input.billing ?? { tier: 'member', subscription_status: 'none' }),
    ]
  )
}

beforeAll(async () => {
  const target = assertMessagingPolicyTestAllowed()
  await withMaintenance(target, async (maintenance) => {
    await maintenance.query(TERMINATE_SQL)
    await maintenance.query(DROP_SQL)
    await maintenance.query(CREATE_SQL)
  })
  testDatabaseUrl = target.databaseUrl
  owner = new Client({ connectionString: testDatabaseUrl })
  await owner.connect()
  const current = await owner.query('select current_database() as name, now() as now')
  if (current.rows[0]?.name !== MESSAGING_POLICY_DATABASE_NAME) {
    throw new Error('Refusing messaging-policy SQL: connected to the wrong database.')
  }
  dbNow = new Date(current.rows[0].now)
  await owner.query(FIXTURE_SQL)
  const root = path.join(process.cwd(), 'supabase/migrations')
  await owner.query(
    readFileSync(path.join(root, '20261009153000_paid_messaging_access.sql'), 'utf8')
  )
  await owner.query(`
    alter table public.member_conversations force row level security;
    alter table public.member_messages force row level security;
    alter table public.member_vouches force row level security;
  `)
  databaseReady = true
})

afterAll(async () => {
  await owner?.end().catch(() => undefined)
  owner = null
  if (!databaseReady) return
  const target = assertMessagingPolicyTestAllowed()
  await withMaintenance(target, async (maintenance) => {
    const current = await maintenance.query('select current_database() as name')
    if (current.rows[0]?.name !== MESSAGING_POLICY_MAINTENANCE_DATABASE) {
      throw new Error('Refusing to drop a database from a non-maintenance connection.')
    }
    await maintenance.query(TERMINATE_SQL)
    await maintenance.query(DROP_SQL)
  })
})

it('matches app messaging entitlement to profile_billing_has_paid_messaging', async () => {
  expect(databaseReady).toBe(true)
  const future = new Date(dbNow.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString()
  const past = new Date(dbNow.getTime() - 24 * 60 * 60 * 1000).toISOString()

  const cases: Array<{ name: string; billing: BillingInput; expected: boolean }> = [
    {
      name: 'active paid membership',
      billing: {
        tier: 'connect',
        subscription_status: 'active',
        billing_period_end: future,
        stripe_price_id: STRIPE_LIVE_PRICE_IDS.connect,
      },
      expected: true,
    },
    {
      name: 'scheduled cancellation with a future paid-through date',
      billing: {
        tier: 'connect',
        subscription_status: 'active',
        cancel_at_period_end: true,
        billing_period_end: future,
        stripe_price_id: STRIPE_LIVE_PRICE_IDS.connect,
      },
      expected: true,
    },
    {
      name: 'scheduled cancellation with an expired paid-through date',
      billing: {
        tier: 'elite_circle',
        subscription_status: 'active',
        cancel_at_period_end: true,
        billing_period_end: past,
        stripe_price_id: STRIPE_LIVE_PRICE_IDS.elite_circle,
      },
      expected: false,
    },
    {
      name: 'immediate cancellation',
      billing: {
        tier: 'elite_circle',
        subscription_status: 'cancelled',
        cancel_at_period_end: false,
        billing_period_end: future,
        stripe_price_id: STRIPE_LIVE_PRICE_IDS.elite_circle,
        ended_paid_tier: 'connect',
      },
      expected: false,
    },
    {
      name: 'stale Elite label after cancellation',
      billing: {
        tier: 'elite_circle',
        subscription_status: 'cancelled',
        stripe_price_id: STRIPE_LIVE_PRICE_IDS.elite_circle,
        ended_paid_tier: 'elite_circle',
      },
      expected: false,
    },
    {
      name: 'stale member label with an active mapped price',
      billing: {
        tier: 'member',
        subscription_status: 'active',
        stripe_price_id: STRIPE_LIVE_PRICE_IDS.connect,
        billing_period_end: future,
      },
      expected: true,
    },
    {
      name: 'past_due paid label',
      billing: {
        tier: 'elite_circle',
        subscription_status: 'past_due',
        stripe_price_id: STRIPE_LIVE_PRICE_IDS.elite_circle,
        billing_period_end: future,
      },
      expected: false,
    },
    {
      name: 'grace with a historical Connect tier and stored price',
      billing: {
        tier: 'connect',
        subscription_status: 'grace',
        billing_period_end: future,
        stripe_price_id: STRIPE_LIVE_PRICE_IDS.connect,
      },
      expected: false,
    },
    {
      name: 'grace with a historical Inner Circle tier',
      billing: {
        tier: 'inner_circle',
        subscription_status: 'grace',
        cancel_at_period_end: false,
        billing_period_end: past,
        stripe_price_id: STRIPE_LIVE_PRICE_IDS.inner_circle,
      },
      expected: false,
    },
    {
      name: 'grace with a historical Elite Circle tier',
      billing: {
        tier: 'elite_circle',
        subscription_status: 'grace',
        cancel_at_period_end: true,
        billing_period_end: past,
        stripe_price_id: STRIPE_LIVE_PRICE_IDS.elite_circle,
      },
      expected: false,
    },
    {
      name: 'manual grace with a historical premium_member tier',
      billing: {
        tier: 'premium_member',
        subscription_status: 'grace',
        billing_period_end: future,
      },
      expected: false,
    },
    {
      name: 'grace with a member tier and a stored price',
      billing: {
        tier: 'member',
        subscription_status: 'grace',
        stripe_price_id: STRIPE_LIVE_PRICE_IDS.elite_circle,
        billing_period_end: future,
      },
      expected: false,
    },
    {
      name: 'legacy premium_member label while active',
      billing: {
        tier: 'premium_member',
        subscription_status: 'active',
        billing_period_end: future,
      },
      expected: true,
    },
  ]

  const results: Array<{ name: string; app: boolean; sql: boolean }> = []
  for (const entry of cases) {
    const app = appCanMessage({ billing: entry.billing })
    const sql = await sqlBillingAllows(entry.billing)
    results.push({ name: entry.name, app, sql })
    expect(app, entry.name).toBe(entry.expected)
    expect(sql, entry.name).toBe(entry.expected)
    expect(sql, `${entry.name} parity`).toBe(app)
  }
  expect(results.every((row) => row.app === row.sql)).toBe(true)

  const communityPartner = {
    tier: 'community_partner',
    subscription_status: 'active',
    billing_period_end: future,
  }
  expect(appCanMessage({ billing: communityPartner })).toBe(false)
  expect(await sqlBillingAllows(communityPartner)).toBe(false)
})

it('matches complimentary override access without changing the override table policy', async () => {
  const future = new Date(dbNow.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString()
  const past = new Date(dbNow.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const earlier = new Date(dbNow.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString()
  const free = { tier: 'member', subscription_status: 'none' }

  await insertProfile({ id: ADMIN, role: 'admin', billing: free, name: 'Admin' })
  await insertProfile({ id: PAID_A, billing: free, name: 'Active override' })
  await insertProfile({ id: PAID_B, billing: free, name: 'Expired override' })
  await insertProfile({ id: UNPAID, billing: free, name: 'Revoked override' })
  await insertProfile({
    id: BYSTANDER,
    role: 'admin',
    billing: free,
    name: 'Admin without entitlement',
  })

  await query(
    `insert into public.membership_access_overrides
      (user_id, tier, starts_at, expires_at, granted_by)
     values ($1, 'elite_circle', $2, $3, $4)`,
    [PAID_A, past, future, ADMIN]
  )
  await query(
    `insert into public.membership_access_overrides
      (user_id, tier, starts_at, expires_at, granted_by)
     values ($1, 'inner_circle', $2, $3, $4)`,
    [PAID_B, earlier, past, ADMIN]
  )
  await query(
    `insert into public.membership_access_overrides
      (user_id, tier, starts_at, expires_at, granted_by, revoked_at, revoked_by)
     values ($1, 'elite_circle', $2, null, $3, $4, $3)`,
    [UNPAID, past, ADMIN, dbNow.toISOString()]
  )

  await insertProfile({ id: AUTHOR, billing: free, name: 'Author' })
  const connectInsert = query(
    `insert into public.membership_access_overrides
      (user_id, tier, starts_at, granted_by)
     values ($1, 'connect', $2, $3)`,
    [AUTHOR, past, ADMIN]
  )
  await expect(connectInsert).rejects.toThrow(/check constraint|membership_access_overrides/)

  const gracePaid = {
    tier: 'elite_circle',
    subscription_status: 'grace',
    stripe_price_id: STRIPE_LIVE_PRICE_IDS.elite_circle,
    billing_period_end: future,
  }
  await query(
    `update public.profiles
     set membership_billing = $2::jsonb
     where id = any($1::uuid[])`,
    [[PAID_A, PAID_B, UNPAID], JSON.stringify(gracePaid)]
  )

  const cases = [
    {
      name: 'grace with a valid complimentary override',
      userId: PAID_A,
      billing: gracePaid,
      override: {
        tier: 'elite_circle' as const,
        startsAt: past,
        expiresAt: future,
        revokedAt: null,
      },
      expected: true,
    },
    {
      name: 'grace with an expired complimentary override',
      userId: PAID_B,
      billing: gracePaid,
      override: {
        tier: 'inner_circle' as const,
        startsAt: earlier,
        expiresAt: past,
        revokedAt: null,
      },
      expected: false,
    },
    {
      name: 'grace with a revoked complimentary override',
      userId: UNPAID,
      billing: gracePaid,
      override: {
        tier: 'elite_circle' as const,
        startsAt: past,
        expiresAt: null,
        revokedAt: dbNow.toISOString(),
      },
      expected: false,
    },
    {
      name: 'admin without personal messaging entitlement',
      userId: BYSTANDER,
      billing: free,
      override: null,
      role: 'admin',
      expected: false,
    },
  ]

  for (const entry of cases) {
    const sql = await query(
      'select public.member_has_paid_messaging($1::uuid) as allowed',
      [entry.userId]
    )
    const app = appCanMessage({
      billing: entry.billing,
      role: entry.role,
      accessOverride: entry.override,
    })
    expect(app, entry.name).toBe(entry.expected)
    expect(sql.rows[0].allowed, entry.name).toBe(entry.expected)
  }

  const adminEntitlements = buildMemberEntitlements({
    role: 'admin',
    billing: free,
    now: dbNow,
  })
  expect(adminEntitlements.productTier).toBe('elite_circle')
  expect(adminEntitlements.billingProductTier).toBe('member')
  expect(canUseMessaging(adminEntitlements)).toBe(false)
})

it('blocks unpaid read, send, update, and mark-read, and keeps admin moderation read-only', async () => {
  const future = new Date(dbNow.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString()
  const paidBilling: BillingInput = {
    tier: 'connect',
    subscription_status: 'active',
    billing_period_end: future,
    stripe_price_id: STRIPE_LIVE_PRICE_IDS.connect,
  }
  await query(
    `update public.profiles set membership_billing = $2::jsonb where id = $1`,
    [PAID_A, JSON.stringify(paidBilling)]
  )
  await query(
    `update public.profiles
     set membership_billing = $2::jsonb, role = 'member'
     where id = $1`,
    [
      PAID_B,
      JSON.stringify({
        tier: 'member',
        subscription_status: 'none',
      }),
    ]
  )
  await insertProfile({
    id: RECIPIENT,
    billing: paidBilling,
    name: 'Paid partner',
  })

  const conversation = await query(
    `insert into public.member_conversations (participant_a, participant_b, status)
     values ($1, $2, 'accepted')
     returning id`,
    [PAID_A, RECIPIENT]
  )
  const conversationId = conversation.rows[0].id as string
  const message = await query(
    `insert into public.member_messages (conversation_id, sender_id, body)
     values ($1, $2, 'Existing history')
     returning id`,
    [conversationId, RECIPIENT]
  )
  const messageId = message.rows[0].id as string

  await asAuthenticated(PAID_B, async (client) => {
    const conversations = await client.query(
      'select id from public.member_conversations where id = $1',
      [conversationId]
    )
    expect(conversations.rowCount).toBe(0)
    const messages = await client.query(
      'select id from public.member_messages where id = $1',
      [messageId]
    )
    expect(messages.rowCount).toBe(0)
  })
  await expectDenied(
    PAID_B,
    `insert into public.member_messages (conversation_id, sender_id, body)
     values ($1, $2, 'unpaid send')`,
    [conversationId, PAID_B]
  )
  await expectDenied(
    PAID_B,
    `update public.member_conversations set updated_at = now() where id = $1`,
    [conversationId]
  )
  await expectDenied(
    PAID_B,
    `update public.member_messages set read_at = now() where id = $1`,
    [messageId]
  )

  const history = await query(
    'select body, read_at from public.member_messages where id = $1',
    [messageId]
  )
  expect(history.rows[0].body).toBe('Existing history')
  expect(history.rows[0].read_at).toBeNull()

  await asAuthenticated(BYSTANDER, async (client) => {
    const conversations = await client.query(
      'select id from public.member_conversations where id = $1',
      [conversationId]
    )
    expect(conversations.rowCount).toBe(1)
    const messages = await client.query(
      'select body from public.member_messages where id = $1',
      [messageId]
    )
    expect(messages.rows[0].body).toBe('Existing history')
  })
  await expectDenied(
    BYSTANDER,
    `insert into public.member_messages (conversation_id, sender_id, body)
     values ($1, $2, 'admin send')`,
    [conversationId, BYSTANDER]
  )
  await expectDenied(
    BYSTANDER,
    `update public.member_messages set read_at = now() where id = $1`,
    [messageId]
  )

  await asAuthenticated(PAID_A, async (client) => {
    const marked = await client.query(
      `update public.member_messages set read_at = now() where id = $1 returning id`,
      [messageId]
    )
    expect(marked.rowCount).toBe(1)
    const sent = await client.query(
      `insert into public.member_messages (conversation_id, sender_id, body)
       values ($1, $2, 'paid reply') returning id`,
      [conversationId, PAID_A]
    )
    expect(sent.rowCount).toBe(1)
  })
})

it('stops vouch authors from approving, editing others, or publishing unreviewed text', async () => {
  const historical = await query(
    `insert into public.member_vouches
      (voucher_id, vouchee_id, vouch_type, relationship_context, note, status)
     values
      ($1, $2, 'personal', 'neighbor', 'Historical active text', 'active'),
      ($1, $3, 'community', 'club', null, 'flagged'),
      ($2, $3, 'professional', 'work', 'Withdrawn text', 'removed')`,
    [AUTHOR, RECIPIENT, BYSTANDER]
  )
  expect(historical.rowCount).toBe(3)

  await query(
    readFileSync(
      path.join(
        process.cwd(),
        'supabase/migrations/20261009153100_vouch_review_lifecycle.sql'
      ),
      'utf8'
    )
  )

  const migrated = await query(
    `select status, note from public.member_vouches order by status, note nulls last`
  )
  expect(migrated.rows.map((row) => row.status).sort()).toEqual([
    'pending',
    'pending',
    'rejected',
  ])
  expect(
    migrated.rows.find((row) => row.note === 'Historical active text')?.status
  ).toBe('pending')
  expect(migrated.rows.find((row) => row.note === null)?.status).toBe('pending')
  expect(migrated.rows.find((row) => row.note === 'Withdrawn text')?.status).toBe(
    'rejected'
  )

  await asAuthenticated(AUTHOR, async (client) => {
    const inserted = await client.query(
      `insert into public.member_vouches
        (voucher_id, vouchee_id, vouch_type, relationship_context, note, status)
       values ($1, $2, 'personal', 'friend', 'Original endorsement', 'approved')
       returning status, moderated_by`,
      [AUTHOR, PAID_A]
    )
    expect(inserted.rows[0].status).toBe('pending')
    expect(inserted.rows[0].moderated_by).toBeNull()

  })
  await expectDenied(
    AUTHOR,
    `update public.member_vouches
     set note = 'Tampered'
     where voucher_id = $1 and vouchee_id = $2 and vouch_type = 'professional'`,
    [RECIPIENT, BYSTANDER]
  )

  const untouched = await query(
    `select note, status from public.member_vouches
     where voucher_id = $1 and vouchee_id = $2`,
    [RECIPIENT, BYSTANDER]
  )
  expect(untouched.rows[0]).toMatchObject({
    note: 'Withdrawn text',
    status: 'rejected',
  })

  await asAuthenticated(RECIPIENT, async (client) => {
    const visible = await client.query(
      `select note from public.member_vouches where voucher_id = $1 and vouchee_id = $2`,
      [AUTHOR, PAID_A]
    )
    expect(visible.rowCount).toBe(0)
  })

  await asAuthenticated(BYSTANDER, async (client) => {
    const approved = await client.query(
      `update public.member_vouches
       set status = 'approved', moderated_by = $2, moderated_at = now()
       where voucher_id = $1 and vouchee_id = $3
       returning id`,
      [AUTHOR, BYSTANDER, PAID_A]
    )
    expect(approved.rowCount).toBe(1)
  })

  await asAuthenticated(RECIPIENT, async (client) => {
    const visible = await client.query(
      `select note, status from public.member_vouches
       where voucher_id = $1 and vouchee_id = $2`,
      [AUTHOR, PAID_A]
    )
    expect(visible.rows).toEqual([
      { note: 'Original endorsement', status: 'approved' },
    ])
  })

  await asAuthenticated(AUTHOR, async (client) => {
    const edited = await client.query(
      `update public.member_vouches
       set note = 'Edited endorsement'
       where voucher_id = $1 and vouchee_id = $2
       returning status, note, moderated_at`,
      [AUTHOR, PAID_A]
    )
    expect(edited.rows[0]).toMatchObject({
      status: 'pending',
      note: 'Edited endorsement',
      moderated_at: null,
    })
    const selfApproved = await client.query(
      `update public.member_vouches
       set status = 'approved', moderated_by = $1, moderated_at = now()
       where voucher_id = $1 and vouchee_id = $2
       returning status`,
      [AUTHOR, PAID_A]
    )
    expect(selfApproved.rows[0].status).toBe('pending')
  })

  await asAuthenticated(RECIPIENT, async (client) => {
    const visible = await client.query(
      `select note from public.member_vouches
       where voucher_id = $1 and vouchee_id = $2`,
      [AUTHOR, PAID_A]
    )
    expect(visible.rowCount).toBe(0)
  })
})
