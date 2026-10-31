import { readFileSync } from 'node:fs'
import { Client, type QueryResult } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Disposable database only. Applies the matching migration as a non-superuser
 * and then tests triggers and row security as authenticated and service_role.
 * Does not connect to the hosted project.
 */

const DATABASE_NAME = 'hsc_matching_identity_test'
const MIGRATION_ROLE = 'hsc_migration_admin'
const VIEWER = '11111111-1111-4111-8111-111111111111'
const CANDIDATE = '22222222-2222-4222-8222-222222222222'
const UNVERIFIED = '33333333-3333-4333-8333-333333333333'
const ADMIN = '44444444-4444-4444-8444-444444444444'
const OTHER = '55555555-5555-4555-8555-555555555555'
const HIST_A = '66666666-6666-4666-8666-666666666666'
const HIST_B = '77777777-7777-4777-8777-777777777777'

function assertTarget() {
  if (process.env.MATCHING_IDENTITY_DESTRUCTIVE_TEST !== '1') {
    throw new Error('MATCHING_IDENTITY_DESTRUCTIVE_TEST=1 is required.')
  }
  const raw = process.env.MATCHING_IDENTITY_DATABASE_URL?.trim() ?? ''
  if (!raw) {
    throw new Error('MATCHING_IDENTITY_DATABASE_URL must name the disposable database.')
  }
  const url = new URL(raw)
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
    throw new Error('Matching identity SQL is limited to loopback.')
  }
  if (url.pathname !== `/${DATABASE_NAME}`) {
    throw new Error(`Matching identity SQL is limited to ${DATABASE_NAME}.`)
  }
  return url
}

const target = assertTarget()
const maintenanceUrl = new URL(target.toString())
maintenanceUrl.pathname = '/postgres'

const PRELUDE = `
create role hsc_migration_admin
  login
  nosuperuser
  createrole
  createdb
  bypassrls
  inherit;
create role hsc_auth_owner nologin nosuperuser nobypassrls;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin nosuperuser nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin nosuperuser nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin nosuperuser nobypassrls;
  end if;
end
$$;

create schema if not exists auth;
alter schema auth owner to hsc_auth_owner;
revoke all on schema auth from public;
grant usage on schema auth to hsc_migration_admin, anon, authenticated, service_role;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

alter function auth.uid() owner to hsc_auth_owner;
revoke all on function auth.uid() from public;
grant execute on function auth.uid() to anon, authenticated, service_role;

create table public.profiles (
  id uuid primary key,
  role text not null default 'member',
  identity_verification_status text not null default 'not_started'
);
alter table public.profiles enable row level security;
create policy "Members read own profile"
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()));

create or replace function public.is_admin(check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to public
set row_security to off
as $$
  select coalesce(
    (select role = 'admin' from public.profiles where id = check_user_id limit 1),
    false
  );
$$;
revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated, service_role;

create table public.in_person_identity_verifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  method text not null,
  status text not null,
  revoked_at timestamptz
);
alter table public.in_person_identity_verifications enable row level security;
revoke all on public.in_person_identity_verifications from anon, authenticated;
grant all on public.in_person_identity_verifications to service_role;

create table public.curated_match_recommendations (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid,
  user_id uuid not null,
  recommended_user_id uuid not null,
  compatibility_score numeric,
  lifecycle_updated_at timestamptz,
  status text not null
    check (status = any (array[
      'pending', 'viewed', 'accepted', 'passed', 'declined', 'expired'
    ]))
);
create table public.friendship_match_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  recommended_user_id uuid not null,
  status text not null
    check (status = any (array['pending', 'viewed', 'passed', 'expired']))
);
alter table public.curated_match_recommendations enable row level security;
alter table public.friendship_match_recommendations enable row level security;

create policy "Members read own curated match recommendations"
  on public.curated_match_recommendations
  for select
  to authenticated
  using (user_id = (select auth.uid()));
create policy "Members update own recommendation lifecycle"
  on public.curated_match_recommendations
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "Admins read all curated match recommendations"
  on public.curated_match_recommendations
  for select
  to authenticated
  using (public.is_admin((select auth.uid())));
create policy "Members read own friendship match recommendations"
  on public.friendship_match_recommendations
  for select
  to authenticated
  using (user_id = (select auth.uid()));

grant all on public.curated_match_recommendations to anon, authenticated, service_role;
grant all on public.friendship_match_recommendations to anon, authenticated, service_role;
`

let owner: Client
let databaseUrl = ''

async function query(sql: string, params: unknown[] = []) {
  return owner.query(sql, params)
}

async function asRole<T>(
  role: 'authenticated' | 'anon' | 'service_role',
  userId: string | null,
  fn: (client: Client) => Promise<T>
): Promise<T> {
  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  try {
    await client.query('begin')
    await client.query(`select set_config('request.jwt.claim.role', $1, true)`, [role])
    await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? ''])
    await client.query(`select set_config('request.jwt.claims', ''::text, true)`)
    await client.query(`set local role ${role}`)
    const result = await fn(client)
    await client.query('commit')
    return result
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    await client.end()
  }
}

beforeAll(async () => {
  const maintenance = new Client({ connectionString: maintenanceUrl.toString() })
  await maintenance.connect()
  await maintenance.query(
    `select pg_terminate_backend(pid)
     from pg_stat_activity
     where datname = $1 and pid <> pg_backend_pid()`,
    [DATABASE_NAME]
  )
  await maintenance.query(`drop database if exists ${DATABASE_NAME}`)
  await maintenance.query('drop role if exists hsc_migration_admin')
  await maintenance.query('drop role if exists matching_identity_reader')
  await maintenance.query('drop role if exists hsc_auth_owner')
  await maintenance.query(`create database ${DATABASE_NAME}`)
  await maintenance.end()

  databaseUrl = target.toString()
  owner = new Client({ connectionString: databaseUrl })
  await owner.connect()
  await query(PRELUDE)
  await query(`
    alter schema public owner to pg_database_owner;
    revoke all on schema public from public;
    revoke all on schema public from hsc_migration_admin;
    grant usage on schema public to public;
    grant usage, create on schema public to pg_database_owner;
    grant usage on schema public to hsc_migration_admin;
    alter table public.profiles owner to hsc_migration_admin;
    alter table public.in_person_identity_verifications owner to hsc_migration_admin;
    alter table public.curated_match_recommendations owner to hsc_migration_admin;
    alter table public.friendship_match_recommendations owner to hsc_migration_admin;
    alter function public.is_admin(uuid) owner to hsc_migration_admin;
  `)
  await query(
    `insert into public.profiles (id, role, identity_verification_status) values
      ($1, 'member', 'not_started'),
      ($2, 'member', 'not_started')`,
    [HIST_A, HIST_B]
  )
  await query(
    `insert into public.curated_match_recommendations (user_id, recommended_user_id, status)
     values ($1, $2, 'passed')`,
    [HIST_A, HIST_B]
  )
  await query(
    `insert into public.friendship_match_recommendations (user_id, recommended_user_id, status)
     values ($1, $2, 'passed')`,
    [HIST_A, HIST_B]
  )

  const maintenanceOwner = new Client({ connectionString: maintenanceUrl.toString() })
  await maintenanceOwner.connect()
  await maintenanceOwner.query(
    `alter database ${DATABASE_NAME} owner to ${MIGRATION_ROLE}`
  )
  await maintenanceOwner.end()

  const migrationSql = readFileSync(
    'supabase/migrations/20261030183000_matching_accepted_identity.sql',
    'utf8'
  )
  if (migrationSql.includes('nobypassrls') || migrationSql.includes('nosuperuser')) {
    throw new Error('Migration still sets a role attribute the hosted migration role cannot set.')
  }
  const migrationUrl = new URL(databaseUrl)
  migrationUrl.username = MIGRATION_ROLE
  migrationUrl.password = ''

  await query('create role matching_identity_reader nologin bypassrls')
  const rejected = new Client({ connectionString: migrationUrl.toString() })
  await rejected.connect()
  try {
    await rejected.query('begin')
    await expect(rejected.query(migrationSql)).rejects.toThrow(/unexpected attributes/)
    await rejected.query('rollback')
  } finally {
    await rejected.end()
  }
  const unrepaired = await query(
    `select rolbypassrls from pg_roles where rolname = 'matching_identity_reader'`
  )
  if (unrepaired.rows[0]?.rolbypassrls !== true) {
    throw new Error('Migration changed BYPASSRLS on an existing reader role.')
  }
  await query('drop role matching_identity_reader')

  const migration = new Client({ connectionString: migrationUrl.toString() })
  await migration.connect()
  try {
    const who = await migration.query<{ name: string; is_super: boolean }>(`
      select current_user as name,
             (select rolsuper from pg_roles where rolname = current_user) as is_super
    `)
    if (who.rows[0]?.name !== MIGRATION_ROLE || who.rows[0]?.is_super !== false) {
      throw new Error('Refusing to apply the matching migration as a superuser.')
    }
    await migration.query('begin')
    await migration.query(migrationSql)
    await migration.query('commit')
  } catch (error) {
    await migration.query('rollback').catch(() => undefined)
    throw error
  } finally {
    await migration.end()
  }

  await query('alter role service_role bypassrls')
  await query(
    `insert into public.profiles (id, role, identity_verification_status) values
      ($1, 'member', 'verified'),
      ($2, 'member', 'not_started'),
      ($3, 'member', 'not_started'),
      ($4, 'admin', 'not_started'),
      ($5, 'member', 'not_started')`,
    [VIEWER, CANDIDATE, UNVERIFIED, ADMIN, OTHER]
  )
  await query(
    `insert into public.in_person_identity_verifications (profile_id, method, status)
     values ($1, 'in_person', 'verified')`,
    [CANDIDATE]
  )
})

afterAll(async () => {
  await owner?.end()
  const maintenance = new Client({ connectionString: maintenanceUrl.toString() })
  await maintenance.connect()
  await maintenance.query(
    `select pg_terminate_backend(pid)
     from pg_stat_activity
     where datname = $1 and pid <> pg_backend_pid()`,
    [DATABASE_NAME]
  )
  await maintenance.query(`drop database if exists ${DATABASE_NAME}`)
  await maintenance.query('drop role if exists matching_identity_reader')
  await maintenance.query('drop role if exists hsc_migration_admin')
  await maintenance.query('drop role if exists hsc_auth_owner')
  await maintenance.end()
})

describe('migration role compatibility', () => {
  it('publishes the reader-owned functions and does not leave elevated grants', async () => {
    const functions = await query(`
      select
        proc.proname,
        pg_get_function_identity_arguments(proc.oid) as identity_args,
        pg_get_function_result(proc.oid) as result,
        proc.prosecdef,
        proc.proconfig,
        owner_role.rolname as owner
      from pg_proc as proc
      join pg_namespace as namespace on namespace.oid = proc.pronamespace
      join pg_roles as owner_role on owner_role.oid = proc.proowner
      where namespace.nspname = 'public'
        and proc.proname in (
          'profile_has_accepted_identity_evidence',
          'reject_matching_without_accepted_identity',
          'curated_match_recommendation_visible',
          'friendship_match_recommendation_visible'
        )
      order by proc.proname
    `)
    expect(functions.rows).toEqual([
      expect.objectContaining({
        proname: 'curated_match_recommendation_visible',
        identity_args: 'recommendation_id uuid',
        result: 'boolean',
        prosecdef: true,
        owner: 'matching_identity_reader',
      }),
      expect.objectContaining({
        proname: 'friendship_match_recommendation_visible',
        identity_args: 'recommendation_id uuid',
        result: 'boolean',
        prosecdef: true,
        owner: 'matching_identity_reader',
      }),
      expect.objectContaining({
        proname: 'profile_has_accepted_identity_evidence',
        identity_args: 'check_user_id uuid',
        result: 'boolean',
        prosecdef: true,
        owner: 'matching_identity_reader',
      }),
      expect.objectContaining({
        proname: 'reject_matching_without_accepted_identity',
        identity_args: '',
        result: 'trigger',
        prosecdef: true,
        owner: 'matching_identity_reader',
      }),
    ])
    for (const row of functions.rows) {
      expect(row.proconfig).toContain('search_path=""')
    }

    const privileges = await query(`
      select
        has_function_privilege('authenticated', 'public.profile_has_accepted_identity_evidence(uuid)', 'execute') as auth_evidence,
        has_function_privilege('anon', 'public.profile_has_accepted_identity_evidence(uuid)', 'execute') as anon_evidence,
        has_function_privilege('service_role', 'public.profile_has_accepted_identity_evidence(uuid)', 'execute') as service_evidence,
        has_function_privilege('public', 'public.profile_has_accepted_identity_evidence(uuid)', 'execute') as public_evidence,
        has_function_privilege('authenticated', 'public.curated_match_recommendation_visible(uuid)', 'execute') as auth_curated,
        has_function_privilege('anon', 'public.curated_match_recommendation_visible(uuid)', 'execute') as anon_curated,
        has_function_privilege('service_role', 'public.curated_match_recommendation_visible(uuid)', 'execute') as service_curated,
        has_function_privilege('authenticated', 'public.friendship_match_recommendation_visible(uuid)', 'execute') as auth_friendship,
        has_function_privilege('authenticated', 'public.reject_matching_without_accepted_identity()', 'execute') as auth_trigger,
        has_function_privilege('service_role', 'public.reject_matching_without_accepted_identity()', 'execute') as service_trigger,
        has_function_privilege('anon', 'public.reject_matching_without_accepted_identity()', 'execute') as anon_trigger,
        has_schema_privilege('matching_identity_reader', 'auth', 'usage') as reader_auth
    `)
    expect(privileges.rows[0]).toEqual({
      auth_evidence: false,
      anon_evidence: false,
      service_evidence: false,
      public_evidence: false,
      auth_curated: true,
      anon_curated: false,
      service_curated: false,
      auth_friendship: true,
      auth_trigger: false,
      service_trigger: true,
      anon_trigger: false,
      reader_auth: false,
    })
  })

  it('replaces the member read policy and leaves the dating admin policy in place', async () => {
    const policies = await query<QueryResult['rows'][number]>(`
      select
        rel.relname as table_name,
        policy.polname,
        policy.polcmd,
        policy.polpermissive,
        pg_get_expr(policy.polqual, policy.polrelid) as expression,
        case
          when policy.polwithcheck is null then null
          else pg_get_expr(policy.polwithcheck, policy.polrelid)
        end as with_check,
        array(
          select granted.rolname
          from pg_roles as granted
          where granted.oid = any (policy.polroles)
          order by granted.rolname
        ) as roles
      from pg_policy as policy
      join pg_class as rel on rel.oid = policy.polrelid
      join pg_namespace as namespace on namespace.oid = rel.relnamespace
      where namespace.nspname = 'public'
        and rel.relname in (
          'curated_match_recommendations',
          'friendship_match_recommendations'
        )
      order by rel.relname, policy.polname
    `)
    const normalized = policies.rows.map((row) => ({
      ...row,
      roles: String(row.roles).replace(/^{|}$/g, ''),
    }))
    expect(normalized).toEqual([
      expect.objectContaining({
        table_name: 'curated_match_recommendations',
        polname: 'Admins read all curated match recommendations',
        polcmd: 'r',
        polpermissive: true,
        expression: 'is_admin(( SELECT auth.uid() AS uid))',
        roles: 'authenticated',
      }),
      expect.objectContaining({
        table_name: 'curated_match_recommendations',
        polname: 'Members read own curated match recommendations',
        polcmd: 'r',
        polpermissive: true,
        expression:
          '( SELECT curated_match_recommendation_visible(curated_match_recommendations.id) AS curated_match_recommendation_visible)',
        roles: 'authenticated',
      }),
      expect.objectContaining({
        table_name: 'curated_match_recommendations',
        polname: 'Members update own recommendation lifecycle',
        polcmd: 'w',
        polpermissive: true,
        expression: '(user_id = ( SELECT auth.uid() AS uid))',
        with_check: '(user_id = ( SELECT auth.uid() AS uid))',
        roles: 'authenticated',
      }),
      expect.objectContaining({
        table_name: 'curated_match_recommendations',
        polname: 'matching_identity_reader_reads_curated_recommendations',
        polcmd: 'r',
        polpermissive: true,
        expression: 'true',
        roles: 'matching_identity_reader',
      }),
      expect.objectContaining({
        table_name: 'friendship_match_recommendations',
        polname: 'Members read own friendship match recommendations',
        polcmd: 'r',
        polpermissive: true,
        expression:
          '( SELECT friendship_match_recommendation_visible(friendship_match_recommendations.id) AS friendship_match_recommendation_visible)',
        roles: 'authenticated',
      }),
      expect.objectContaining({
        table_name: 'friendship_match_recommendations',
        polname: 'matching_identity_reader_reads_friendship_recommendations',
        polcmd: 'r',
        polpermissive: true,
        expression: 'true',
        roles: 'matching_identity_reader',
      }),
    ])
    const memberReads = normalized.filter((row) =>
      String(row.polname).startsWith('Members read')
    )
    expect(memberReads.map((row) => row.expression).join('\n')).not.toContain('user_id')
    const columns = await query(
      `select
         has_column_privilege('authenticated', 'public.curated_match_recommendations', 'user_id', 'UPDATE') as user_id,
         has_column_privilege('authenticated', 'public.curated_match_recommendations', 'recommended_user_id', 'UPDATE') as candidate,
         has_column_privilege('authenticated', 'public.curated_match_recommendations', 'batch_id', 'UPDATE') as batch_id,
         has_column_privilege('authenticated', 'public.curated_match_recommendations', 'status', 'UPDATE') as status,
         has_column_privilege('authenticated', 'public.curated_match_recommendations', 'compatibility_score', 'UPDATE') as score`
    )
    expect(columns.rows[0]).toEqual({
      user_id: true,
      candidate: true,
      batch_id: true,
      status: true,
      score: true,
    })

    const triggers = await query(`
      select pg_get_triggerdef(pg_trigger.oid) as definition
      from pg_trigger
      join pg_class as rel on rel.oid = pg_trigger.tgrelid
      join pg_namespace as namespace on namespace.oid = rel.relnamespace
      where namespace.nspname = 'public'
        and pg_trigger.tgname in (
          'curated_match_requires_accepted_identity',
          'friendship_match_requires_accepted_identity'
        )
        and not pg_trigger.tgisinternal
      order by pg_trigger.tgname
    `)
    expect(triggers.rows.map((row) => row.definition)).toEqual([
      'CREATE TRIGGER curated_match_requires_accepted_identity BEFORE INSERT OR UPDATE ON public.curated_match_recommendations FOR EACH ROW EXECUTE FUNCTION reject_matching_without_accepted_identity()',
      'CREATE TRIGGER friendship_match_requires_accepted_identity BEFORE INSERT OR UPDATE ON public.friendship_match_recommendations FOR EACH ROW EXECUTE FUNCTION reject_matching_without_accepted_identity()',
    ])
  })

  it('leaves the pre-migration historical rows unchanged', async () => {
    const rows = await query(
      `select 'curated' as source, user_id::text, recommended_user_id::text, status
       from public.curated_match_recommendations
       where user_id = $1
       union all
       select 'friendship', user_id::text, recommended_user_id::text, status
       from public.friendship_match_recommendations
       where user_id = $1
       order by source`,
      [HIST_A]
    )
    expect(rows.rows).toEqual([
      {
        source: 'curated',
        user_id: HIST_A,
        recommended_user_id: HIST_B,
        status: 'passed',
      },
      {
        source: 'friendship',
        user_id: HIST_A,
        recommended_user_id: HIST_B,
        status: 'passed',
      },
    ])
  })
})

describe('runtime trigger and row security', () => {
  it('blocks service-role publication without identity and still allows cleanup', async () => {
    await expect(
      asRole('service_role', null, (client) =>
        client.query(
          `insert into public.curated_match_recommendations (user_id, recommended_user_id, status)
           values ($1, $2, 'pending')`,
          [VIEWER, UNVERIFIED]
        )
      )
    ).rejects.toThrow(/accepted identity is required/)

    await expect(
      asRole('service_role', null, (client) =>
        client.query(
          `insert into public.friendship_match_recommendations (user_id, recommended_user_id, status)
           values ($1, $2, 'viewed')`,
          [UNVERIFIED, CANDIDATE]
        )
      )
    ).rejects.toThrow(/accepted identity is required/)

    const curated = await asRole('service_role', null, (client) =>
      client.query<{ id: string }>(
        `insert into public.curated_match_recommendations (user_id, recommended_user_id, status)
         values ($1, $2, 'pending') returning id::text`,
        [VIEWER, CANDIDATE]
      )
    )
    const friendship = await asRole('service_role', null, (client) =>
      client.query<{ id: string }>(
        `insert into public.friendship_match_recommendations (user_id, recommended_user_id, status)
         values ($1, $2, 'viewed') returning id::text`,
        [VIEWER, CANDIDATE]
      )
    )
    const curatedId = curated.rows[0].id
    const friendshipId = friendship.rows[0].id

    await asRole('service_role', null, (client) =>
      client.query(
        `update public.in_person_identity_verifications
         set status = 'revoked', revoked_at = now()
         where profile_id = $1`,
        [CANDIDATE]
      )
    )

    await expect(
      asRole('service_role', null, (client) =>
        client.query(
          `update public.curated_match_recommendations
           set status = 'pending'
           where id = $1`,
          [curatedId]
        )
      )
    ).rejects.toThrow(/accepted identity is required/)

    const afterFailedPending = await query(
      `select status, recommended_user_id::text
       from public.curated_match_recommendations where id = $1`,
      [curatedId]
    )
    expect(afterFailedPending.rows[0]).toEqual({
      status: 'pending',
      recommended_user_id: CANDIDATE,
    })

    await expect(
      asRole('service_role', null, (client) =>
        client.query(
          `update public.curated_match_recommendations
           set recommended_user_id = $2
           where id = $1`,
          [curatedId, UNVERIFIED]
        )
      )
    ).rejects.toThrow(/accepted identity is required/)

    await asRole('service_role', null, async (client) => {
      await client.query(
        `update public.curated_match_recommendations set status = 'passed' where id = $1`,
        [curatedId]
      )
      await client.query(
        `update public.curated_match_recommendations set status = 'expired' where id = $1`,
        [curatedId]
      )
      await client.query(
        `update public.friendship_match_recommendations set status = 'expired' where id = $1`,
        [friendshipId]
      )
    })

    const closed = await query(
      `select
         (select status from public.curated_match_recommendations where id = $1) as curated_status,
         (select recommended_user_id::text from public.curated_match_recommendations where id = $1) as curated_candidate,
         (select status from public.friendship_match_recommendations where id = $2) as friendship_status`,
      [curatedId, friendshipId]
    )
    expect(closed.rows[0]).toEqual({
      curated_status: 'expired',
      curated_candidate: CANDIDATE,
      friendship_status: 'expired',
    })

    await expect(
      asRole('service_role', null, (client) =>
        client.query(
          `update public.curated_match_recommendations set status = 'viewed' where id = $1`,
          [curatedId]
        )
      )
    ).rejects.toThrow(/accepted identity is required/)

    await query(
      `update public.profiles set identity_verification_status = 'verified' where id = $1`,
      [CANDIDATE]
    )
    const stripeAfterRevoke = await asRole('service_role', null, (client) =>
      client.query(
        `insert into public.curated_match_recommendations (user_id, recommended_user_id, status)
         values ($1, $2, 'pending') returning id::text`,
        [VIEWER, CANDIDATE]
      )
    )
    expect(stripeAfterRevoke.rows).toHaveLength(1)
  })

  it('shows a member only their own recommendation when both identities are accepted', async () => {
    const visibleId = (
      await query<{ id: string }>(
        `select id::text from public.curated_match_recommendations
         where user_id = $1 and recommended_user_id = $2 and status = 'pending'
         order by id desc limit 1`,
        [VIEWER, CANDIDATE]
      )
    ).rows[0].id

    const own = await asRole('authenticated', VIEWER, (client) =>
      client.query(`select id::text from public.curated_match_recommendations where id = $1`, [
        visibleId,
      ])
    )
    expect(own.rows).toHaveLength(1)

    await query(`
      create schema if not exists matching_identity_trap;
      create or replace function matching_identity_trap.curated_match_recommendation_visible(recommendation_id uuid)
      returns boolean
      language sql
      as $$ select true $$;
      grant usage on schema matching_identity_trap to authenticated;
      grant execute on function matching_identity_trap.curated_match_recommendation_visible(uuid) to authenticated;
    `)
    const trappedVisible = await asRole('authenticated', VIEWER, async (client) => {
      await client.query('set local search_path to matching_identity_trap, public')
      return client.query(
        `select id::text from public.curated_match_recommendations where id = $1`,
        [visibleId]
      )
    })
    expect(trappedVisible.rows).toHaveLength(1)

    const stranger = await asRole('authenticated', OTHER, (client) =>
      client.query(`select id::text from public.curated_match_recommendations where id = $1`, [
        visibleId,
      ])
    )
    expect(stranger.rows).toHaveLength(0)

    const anonymous = await asRole('anon', null, (client) =>
      client.query(`select id::text from public.curated_match_recommendations where id = $1`, [
        visibleId,
      ])
    )
    expect(anonymous.rows).toHaveLength(0)

    await query(
      `update public.profiles set identity_verification_status = 'not_started' where id = $1`,
      [CANDIDATE]
    )
    const hidden = await asRole('authenticated', VIEWER, async (client) => {
      await client.query('set local search_path to matching_identity_trap, public')
      return client.query(
        `select id::text from public.curated_match_recommendations where id = $1`,
        [visibleId]
      )
    })
    expect(hidden.rows).toHaveLength(0)
    const stored = await query(
      `select count(*)::int as count from public.curated_match_recommendations where id = $1`,
      [visibleId]
    )
    expect(stored.rows[0].count).toBe(1)

    const admin = await asRole('authenticated', ADMIN, (client) =>
      client.query(`select id::text from public.curated_match_recommendations where id = $1`, [
        visibleId,
      ])
    )
    expect(admin.rows).toHaveLength(1)

    const friendshipHiddenFromAdmin = await asRole('authenticated', ADMIN, (client) =>
      client.query(
        `select id::text from public.friendship_match_recommendations where user_id = $1`,
        [VIEWER]
      )
    )
    expect(friendshipHiddenFromAdmin.rows).toHaveLength(0)

    await expect(
      asRole('authenticated', VIEWER, (client) =>
        client.query(`select public.profile_has_accepted_identity_evidence($1)`, [CANDIDATE])
      )
    ).rejects.toThrow(/permission denied/)

    const probed = await asRole('authenticated', OTHER, (client) =>
      client.query<{ visible: boolean }>(
        `select public.curated_match_recommendation_visible($1::uuid) as visible`,
        [visibleId]
      )
    )
    expect(probed.rows[0].visible).toBe(false)

    const missing = await asRole('authenticated', VIEWER, (client) =>
      client.query<{ visible: boolean }>(
        `select public.friendship_match_recommendation_visible($1::uuid) as visible`,
        ['99999999-9999-4999-8999-999999999999']
      )
    )
    expect(missing.rows[0].visible).toBe(false)

    await expect(
      asRole('authenticated', VIEWER, (client) =>
        client.query(
          `insert into public.curated_match_recommendations (user_id, recommended_user_id, status)
           values ($1, $2, 'pending')`,
          [VIEWER, CANDIDATE]
        )
      )
    ).rejects.toThrow()

    const hiddenUpdate = await asRole('authenticated', VIEWER, (client) =>
      client.query(
        `update public.curated_match_recommendations set status = 'viewed' where id = $1`,
        [visibleId]
      )
    )
    expect(hiddenUpdate.rowCount).toBe(0)
    const stillPending = await query(
      `select status from public.curated_match_recommendations where id = $1`,
      [visibleId]
    )
    expect(stillPending.rows[0].status).toBe('pending')
  })

  it('keeps the dating lifecycle update and blocks republication', async () => {
    await query(
      `update public.profiles set identity_verification_status = 'verified' where id = $1`,
      [CANDIDATE]
    )
    const created = await asRole('service_role', null, (client) =>
      client.query<{ id: string }>(
        `insert into public.curated_match_recommendations
           (batch_id, user_id, recommended_user_id, compatibility_score, status)
         values ($1, $2, $3, 80, 'viewed') returning id::text`,
        ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', VIEWER, CANDIDATE]
      )
    )
    const id = created.rows[0].id

    const passed = await asRole('authenticated', VIEWER, (client) =>
      client.query(
        `update public.curated_match_recommendations
         set status = 'passed', lifecycle_updated_at = now()
         where id = $1`,
        [id]
      )
    )
    expect(passed.rowCount).toBe(1)

    const stranger = await asRole('authenticated', OTHER, (client) =>
      client.query(
        `update public.curated_match_recommendations set status = 'expired' where id = $1`,
        [id]
      )
    )
    expect(stranger.rowCount).toBe(0)

    await query(
      `update public.profiles set identity_verification_status = 'not_started' where id = $1`,
      [CANDIDATE]
    )
    const hidden = await asRole('authenticated', VIEWER, (client) =>
      client.query(`select id from public.curated_match_recommendations where id = $1`, [id])
    )
    expect(hidden.rows).toHaveLength(0)

    const hiddenPass = await asRole('authenticated', VIEWER, (client) =>
      client.query(
        `update public.curated_match_recommendations
         set status = 'expired', lifecycle_updated_at = now()
         where id = $1 and status = 'passed'`,
        [id]
      )
    )
    expect(hiddenPass.rowCount).toBe(0)
    const stillPassed = await query(
      `select status from public.curated_match_recommendations where id = $1`,
      [id]
    )
    expect(stillPassed.rows[0].status).toBe('passed')

    const hiddenRepublication = await asRole('authenticated', VIEWER, (client) =>
      client.query(
        `update public.curated_match_recommendations set status = 'pending' where id = $1`,
        [id]
      )
    )
    expect(hiddenRepublication.rowCount).toBe(0)
    await expect(
      asRole('service_role', null, (client) =>
        client.query(
          `update public.curated_match_recommendations set status = 'viewed' where id = $1`,
          [id]
        )
      )
    ).rejects.toThrow(/accepted identity is required/)

    await asRole('service_role', null, (client) =>
      client.query(
        `update public.curated_match_recommendations set status = 'expired' where id = $1`,
        [id]
      )
    )
    const closed = await query(
      `select status, recommended_user_id::text as candidate
       from public.curated_match_recommendations where id = $1`,
      [id]
    )
    expect(closed.rows[0]).toEqual({ status: 'expired', candidate: CANDIDATE })

    await query(
      `update public.profiles set identity_verification_status = 'verified' where id = $1`,
      [CANDIDATE]
    )
    const active = await asRole('service_role', null, (client) =>
      client.query<{ id: string }>(
        `insert into public.curated_match_recommendations
           (batch_id, user_id, recommended_user_id, compatibility_score, status)
         values ($1, $2, $3, 70, 'pending') returning id::text`,
        ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', VIEWER, CANDIDATE]
      )
    )
    const activeId = active.rows[0].id
    await expect(
      asRole('authenticated', VIEWER, (client) =>
        client.query(
          `update public.curated_match_recommendations
           set recommended_user_id = $2
           where id = $1`,
          [activeId, UNVERIFIED]
        )
      )
    ).rejects.toThrow(/accepted identity is required/)
    const kept = await query(
      `select recommended_user_id::text as candidate, status
       from public.curated_match_recommendations where id = $1`,
      [activeId]
    )
    expect(kept.rows[0]).toEqual({ candidate: CANDIDATE, status: 'pending' })

    const broadened = await asRole('authenticated', VIEWER, (client) =>
      client.query(
        `update public.curated_match_recommendations
         set batch_id = $2, compatibility_score = 11
         where id = $1`,
        [activeId, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']
      )
    )
    expect(broadened.rowCount).toBe(1)

    await expect(
      asRole('authenticated', VIEWER, (client) =>
        client.query(
          `update public.curated_match_recommendations set user_id = $2 where id = $1`,
          [activeId, UNVERIFIED]
        )
      )
    ).rejects.toThrow(/accepted identity is required/)
    await expect(
      asRole('authenticated', VIEWER, (client) =>
        client.query(
          `update public.curated_match_recommendations set user_id = $2 where id = $1`,
          [activeId, CANDIDATE]
        )
      )
    ).rejects.toThrow(/row-level security/)
    const ownerKept = await query(
      `select user_id::text as owner, batch_id::text as batch
       from public.curated_match_recommendations where id = $1`,
      [activeId]
    )
    expect(ownerKept.rows[0]).toEqual({
      owner: VIEWER,
      batch: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    })

    await asRole('service_role', null, (client) =>
      client.query(
        `update public.curated_match_recommendations set status = 'passed' where id = $1`,
        [activeId]
      )
    )
    const reassigned = await asRole('authenticated', VIEWER, (client) =>
      client.query(
        `update public.curated_match_recommendations
         set recommended_user_id = $2
         where id = $1 and status = 'passed'`,
        [activeId, UNVERIFIED]
      )
    )
    expect(reassigned.rowCount).toBe(1)
    const notRepublished = await query(
      `select status, recommended_user_id::text as candidate
       from public.curated_match_recommendations where id = $1`,
      [activeId]
    )
    expect(notRepublished.rows[0]).toEqual({
      status: 'passed',
      candidate: UNVERIFIED,
    })

    const friendship = await asRole('authenticated', VIEWER, (client) =>
      client.query(
        `update public.friendship_match_recommendations
         set status = 'expired'
         where user_id = $1`,
        [VIEWER]
      )
    )
    expect(friendship.rowCount).toBe(0)
  })
})
