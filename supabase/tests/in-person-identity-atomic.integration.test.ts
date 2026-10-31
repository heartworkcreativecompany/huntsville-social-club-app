import { readFileSync } from 'node:fs'
import { Client, type QueryResult } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  IN_PERSON_IDENTITY_DATABASE_NAME,
  IN_PERSON_IDENTITY_MAINTENANCE_DATABASE,
  assertInPersonIdentityTestAllowed,
  inPersonIdentityMaintenanceDatabaseUrl,
  type InPersonIdentityTestTarget,
} from './in-person-identity-test-guard'

/**
 * Disposable-database suite. Excluded from `npm test`.
 * Creates and drops only hsc_in_person_identity_test.
 * Applies the existing in-person migration and the atomic-audit migration.
 * service_role BYPASSRLS is set only in this database so the test can show
 * the existing table grant. It is not part of the migration.
 */

const ADMIN = '44444444-4444-4444-8444-444444444444'
const ADMIN_2 = '55555555-5555-4555-8555-555555555555'
const MEMBER = '22222222-2222-4222-8222-222222222222'
const STRIPE_MEMBER = '33333333-3333-4333-8333-333333333333'
const RACE_MEMBER = '66666666-6666-4666-8666-666666666666'
const REVOKE_MEMBER = '77777777-7777-4777-8777-777777777777'
const FAIL_RECORD_MEMBER = '88888888-8888-4888-8888-888888888888'
const FAIL_REVOKE_MEMBER = '99999999-9999-4999-8999-999999999999'
const PLAIN_MEMBER = '12121212-1212-4121-8121-121212121212'

const CLAIMS_MEMBER = '10101010-1010-4010-8010-101010101010'
const MIGRATION_ROLE = 'hsc_migration_admin'

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

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

alter function auth.uid() owner to hsc_auth_owner;
alter function auth.role() owner to hsc_auth_owner;
grant execute on function auth.uid() to public;
grant execute on function auth.role() to public;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key,
  email text,
  full_name text,
  role text not null default 'member',
  application_status text not null default 'approved',
  identity_verification_status text not null default 'not_started',
  messaging_suspended_at timestamptz,
  membership_billing jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

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

create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  target_member_id uuid references public.profiles (id) on delete set null,
  action_type text not null,
  source_type text,
  source_id uuid,
  reason text,
  details text,
  created_at timestamptz not null default now()
);

alter table public.moderation_actions enable row level security;
`

const TERMINATE_SQL = `
  select pg_terminate_backend(pid)
  from pg_stat_activity
  where datname = 'hsc_in_person_identity_test'
    and pid <> pg_backend_pid()
`
const DROP_SQL = 'drop database if exists hsc_in_person_identity_test'
const CREATE_SQL = 'create database hsc_in_person_identity_test'

let owner: Client | null = null
let testDatabaseUrl = ''

async function query(sql: string, values: unknown[] = []): Promise<QueryResult> {
  if (!owner) throw new Error('disposable test database is not connected')
  return owner.query(sql, values)
}

async function withMaintenance<T>(
  target: InPersonIdentityTestTarget,
  fn: (client: Client) => Promise<T>
): Promise<T> {
  const allowed = assertInPersonIdentityTestAllowed()
  if (
    allowed.databaseName !== target.databaseName ||
    allowed.databaseUrl !== target.databaseUrl
  ) {
    throw new Error('Refusing in-person identity SQL: target changed before connect.')
  }
  const client = new Client({
    connectionString: inPersonIdentityMaintenanceDatabaseUrl(allowed),
  })
  await client.connect()
  try {
    const current = await client.query('select current_database() as name')
    const name = String(current.rows[0]?.name ?? '')
    if (
      name !== IN_PERSON_IDENTITY_MAINTENANCE_DATABASE ||
      name === IN_PERSON_IDENTITY_DATABASE_NAME
    ) {
      throw new Error(
        'Refusing in-person identity SQL: maintenance connection is not the postgres database.'
      )
    }
    return await fn(client)
  } finally {
    await client.end()
  }
}

async function asRole<T>(
  role: 'authenticated' | 'anon' | 'service_role',
  userId: string | null,
  fn: (client: Client) => Promise<T>
): Promise<T> {
  if (!testDatabaseUrl) throw new Error('disposable test database is not connected')
  const client = new Client({ connectionString: testDatabaseUrl })
  await client.connect()
  try {
    await client.query('begin')
    await client.query(`select set_config('request.jwt.claim.role', $1, true)`, [
      role,
    ])
    await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [
      userId ?? '',
    ])
    await client.query(`select set_config('request.jwt.claims', ''::text, true)`)
    await client.query(`select set_config('app.current_user_id', ''::text, true)`)
    await client.query(`set local role ${role}`)
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

async function asAdmin<T>(
  userId: string,
  fn: (client: Client) => Promise<T>
): Promise<T> {
  return asRole('authenticated', userId, fn)
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function insertProfile(
  id: string,
  role: string,
  stripeStatus = 'not_started'
) {
  await query(
    `insert into public.profiles (id, role, application_status, identity_verification_status)
     values ($1, $2, 'approved', $3)`,
    [id, role, stripeStatus]
  )
}

describe('atomic in-person identity database functions', () => {
  beforeAll(async () => {
    const target = assertInPersonIdentityTestAllowed()
    testDatabaseUrl = target.databaseUrl
    await withMaintenance(target, async (client) => {
      await client.query(TERMINATE_SQL)
      await client.query(DROP_SQL)
      await client.query('drop role if exists hsc_migration_admin')
      await client.query('drop role if exists in_person_identity_writer')
      await client.query('drop role if exists hsc_auth_owner')
      await client.query(CREATE_SQL)
    })
    owner = new Client({ connectionString: testDatabaseUrl })
    await owner.connect()
    const current = await owner.query('select current_database() as name')
    if (current.rows[0]?.name !== IN_PERSON_IDENTITY_DATABASE_NAME) {
      throw new Error('Refusing in-person identity SQL: connected to the wrong database.')
    }
    await owner.query(PRELUDE)
    await withMaintenance(target, async (client) => {
      await client.query(
        'alter database hsc_in_person_identity_test owner to hsc_migration_admin'
      )
    })
    await owner.query(`
      alter schema public owner to pg_database_owner;
      revoke all on schema public from public;
      revoke all on schema public from hsc_migration_admin;
      grant usage on schema public to public;
      grant usage, create on schema public to pg_database_owner;
      grant usage on schema public to hsc_migration_admin;
    `)
    await owner.query(
      readFileSync(
        'supabase/migrations/20261027200000_in_person_identity_verification.sql',
        'utf8'
      )
    )
    await owner.query(`
      alter table public.profiles owner to hsc_migration_admin;
      alter table public.moderation_actions owner to hsc_migration_admin;
      alter table public.in_person_identity_verifications owner to hsc_migration_admin;
      alter function public.is_admin(uuid) owner to hsc_migration_admin;
      alter function public.set_updated_at() owner to hsc_migration_admin;
      alter function public.profile_has_accepted_identity(uuid) owner to hsc_migration_admin;
    `)
    const migrationUrl = new URL(testDatabaseUrl)
    migrationUrl.username = MIGRATION_ROLE
    migrationUrl.password = ''
    const migration = new Client({ connectionString: migrationUrl.toString() })
    await migration.connect()
    try {
      const who = await migration.query<{ name: string; is_super: boolean }>(`
        select current_user as name,
               (select rolsuper from pg_roles where rolname = current_user) as is_super
      `)
      if (who.rows[0]?.name !== MIGRATION_ROLE || who.rows[0]?.is_super !== false) {
        throw new Error('Refusing to apply the in-person migration as a superuser.')
      }
      await migration.query('begin')
      await migration.query(
        readFileSync(
          'supabase/migrations/20261029190000_in_person_identity_atomic_audit.sql',
          'utf8'
        )
      )
      await migration.query('commit')
    } catch (error) {
      await migration.query('rollback').catch(() => undefined)
      throw error
    } finally {
      await migration.end()
    }
    await owner.query('alter role service_role bypassrls')
    await insertProfile(ADMIN, 'admin')
    await insertProfile(ADMIN_2, 'admin')
    await insertProfile(MEMBER, 'member')
    await insertProfile(PLAIN_MEMBER, 'member')
    await insertProfile(STRIPE_MEMBER, 'member', 'verified')
    await insertProfile(RACE_MEMBER, 'member')
    await insertProfile(REVOKE_MEMBER, 'member')
    await insertProfile(FAIL_RECORD_MEMBER, 'member')
    await insertProfile(FAIL_REVOKE_MEMBER, 'member')
    await insertProfile(CLAIMS_MEMBER, 'member')
  })

  afterAll(async () => {
    await owner?.end()
    owner = null
    const target = assertInPersonIdentityTestAllowed()
    await withMaintenance(target, async (client) => {
      await client.query(TERMINATE_SQL)
      await client.query(DROP_SQL)
      await client.query('drop role if exists hsc_migration_admin')
      await client.query('drop role if exists in_person_identity_writer')
      await client.query('drop role if exists hsc_auth_owner')
    })
  })

  it('publishes secure function metadata and does not broaden table grants', async () => {
    const functions = await query(`
      select
        proc.proname,
        pg_get_function_identity_arguments(proc.oid) as args,
        proc.prosecdef,
        proc.proconfig,
        pg_get_functiondef(proc.oid) as definition,
        owner_role.rolname as owner
      from pg_proc as proc
      join pg_namespace as ns on ns.oid = proc.pronamespace
      join pg_roles as owner_role on owner_role.oid = proc.proowner
      where ns.nspname = 'public'
        and proc.proname in (
          'record_in_person_identity_verification',
          'revoke_in_person_identity_verification'
        )
      order by proc.proname
    `)
    expect(functions.rows).toEqual([
      expect.objectContaining({
        proname: 'record_in_person_identity_verification',
        args: 'target_profile_id uuid, confirmed boolean',
        prosecdef: true,
        owner: 'in_person_identity_writer',
      }),
      expect.objectContaining({
        proname: 'revoke_in_person_identity_verification',
        args: 'target_profile_id uuid, reason text',
        prosecdef: true,
        owner: 'in_person_identity_writer',
      }),
    ])
    for (const row of functions.rows) {
      expect(row.proconfig).toContain('search_path=""')
      expect(String(row.definition)).not.toMatch(/when unique_violation|when others/i)
      expect(String(row.definition)).not.toMatch(/auth\.uid\(|auth\.role\(/)
    }

    const privileges = await query(`
      select
        has_function_privilege('authenticated', 'public.record_in_person_identity_verification(uuid, boolean)', 'execute') as auth_record,
        has_function_privilege('anon', 'public.record_in_person_identity_verification(uuid, boolean)', 'execute') as anon_record,
        has_function_privilege('service_role', 'public.record_in_person_identity_verification(uuid, boolean)', 'execute') as service_record,
        has_function_privilege('public', 'public.record_in_person_identity_verification(uuid, boolean)', 'execute') as public_record,
        has_function_privilege('authenticated', 'public.revoke_in_person_identity_verification(uuid, text)', 'execute') as auth_revoke,
        has_function_privilege('anon', 'public.revoke_in_person_identity_verification(uuid, text)', 'execute') as anon_revoke,
        has_function_privilege('service_role', 'public.revoke_in_person_identity_verification(uuid, text)', 'execute') as service_revoke,
        has_table_privilege('authenticated', 'public.in_person_identity_verifications', 'insert') as auth_insert,
        has_table_privilege('anon', 'public.in_person_identity_verifications', 'insert') as anon_insert,
        has_table_privilege('service_role', 'public.in_person_identity_verifications', 'insert') as service_insert
    `)
    expect(privileges.rows[0]).toEqual({
      auth_record: true,
      anon_record: false,
      service_record: false,
      public_record: false,
      auth_revoke: true,
      anon_revoke: false,
      service_revoke: false,
      auth_insert: false,
      anon_insert: false,
      service_insert: true,
    })
  })

  it('keeps the writer role inside the migration role’s privileges', async () => {
    const migrationRole = await query(
      `select rolsuper, rolcreaterole, rolbypassrls
       from pg_roles
       where rolname = $1`,
      [MIGRATION_ROLE]
    )
    expect(migrationRole.rows[0]).toEqual({
      rolsuper: false,
      rolcreaterole: true,
      rolbypassrls: true,
    })

    const writer = await query(`
      select rolcanlogin, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls, rolreplication
      from pg_roles
      where rolname = 'in_person_identity_writer'
    `)
    expect(writer.rows[0]).toEqual({
      rolcanlogin: false,
      rolsuper: false,
      rolcreaterole: false,
      rolcreatedb: false,
      rolbypassrls: false,
      rolreplication: false,
    })

    const scope = await query(`
      select
        has_schema_privilege('in_person_identity_writer', 'public', 'USAGE') as public_usage,
        has_schema_privilege('in_person_identity_writer', 'public', 'CREATE') as public_create,
        has_schema_privilege('in_person_identity_writer', 'auth', 'USAGE') as auth_usage,
        exists (
          select 1
          from pg_namespace namespace
          cross join lateral aclexplode(namespace.nspacl) acl
          join pg_roles grantee on grantee.oid = acl.grantee
          where namespace.nspname = 'auth'
            and grantee.rolname = 'in_person_identity_writer'
        ) as auth_acl,
        exists (
          select 1
          from pg_auth_members membership
          join pg_roles member_role on member_role.oid = membership.member
          join pg_roles granted_role on granted_role.oid = membership.roleid
          where member_role.rolname = 'in_person_identity_writer'
            and granted_role.rolname in (
              'anon', 'authenticated', 'service_role', 'postgres',
              'pg_database_owner', 'hsc_migration_admin'
            )
        ) as forbidden_membership,
        exists (
          select 1
          from pg_auth_members membership
          join pg_roles member_role on member_role.oid = membership.member
          join pg_roles granted_role on granted_role.oid = membership.roleid
          where granted_role.rolname = 'in_person_identity_writer'
            and member_role.rolname = 'hsc_migration_admin'
        ) as runner_can_assume_writer
    `)
    expect(scope.rows[0]).toEqual({
      public_usage: true,
      public_create: false,
      auth_usage: false,
      auth_acl: false,
      forbidden_membership: false,
      runner_can_assume_writer: true,
    })

    const directGrants = await query(`
      select c.relname as table_name, acl.privilege_type
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(c.relacl) acl
      join pg_roles grantee on grantee.oid = acl.grantee
      where n.nspname = 'public'
        and grantee.rolname = 'in_person_identity_writer'
        and c.relname in (
          'in_person_identity_verifications',
          'moderation_actions',
          'profiles'
        )
      order by c.relname, acl.privilege_type
    `)
    expect(directGrants.rows).toEqual([
      { table_name: 'in_person_identity_verifications', privilege_type: 'INSERT' },
      { table_name: 'in_person_identity_verifications', privilege_type: 'SELECT' },
      { table_name: 'in_person_identity_verifications', privilege_type: 'UPDATE' },
      { table_name: 'moderation_actions', privilege_type: 'INSERT' },
      { table_name: 'profiles', privilege_type: 'SELECT' },
    ])

    const policies = await query(`
      select tablename, policyname, cmd, roles, qual, with_check
      from pg_policies
      where policyname like 'in_person_identity_writer%'
      order by policyname
    `)
    expect(policies.rows).toEqual([
      expect.objectContaining({
        policyname: 'in_person_identity_writer_inserts_audits',
        tablename: 'moderation_actions',
        cmd: 'INSERT',
        qual: null,
      }),
      expect.objectContaining({
        policyname: 'in_person_identity_writer_inserts_verifications',
        tablename: 'in_person_identity_verifications',
        cmd: 'INSERT',
        qual: null,
        with_check: 'true',
      }),
      expect.objectContaining({
        policyname: 'in_person_identity_writer_reads_profiles',
        tablename: 'profiles',
        cmd: 'SELECT',
        qual: 'true',
        with_check: null,
      }),
      expect.objectContaining({
        policyname: 'in_person_identity_writer_reads_verifications',
        tablename: 'in_person_identity_verifications',
        cmd: 'SELECT',
        qual: 'true',
        with_check: null,
      }),
      expect.objectContaining({
        policyname: 'in_person_identity_writer_updates_verifications',
        tablename: 'in_person_identity_verifications',
        cmd: 'UPDATE',
        qual: 'true',
        with_check: 'true',
      }),
    ])
    const auditPolicy = policies.rows.find(
      (row) => row.policyname === 'in_person_identity_writer_inserts_audits'
    )
    expect(String(auditPolicy?.with_check)).toContain('in_person_identity_verified')
    expect(String(auditPolicy?.with_check)).toContain('in_person_identity_revoked')
    expect(String(auditPolicy?.with_check)).toContain('in_person_identity_verification')
    expect(String(auditPolicy?.roles)).toContain('in_person_identity_writer')
  })

  it('records and revokes for an admin, preserving history and the original actor', async () => {
    const recorded = await asAdmin(ADMIN, (client) =>
      client.query(
        `select public.record_in_person_identity_verification($1, true) as result`,
        [MEMBER]
      )
    )
    expect(recorded.rows[0].result.already_verified).toBe(false)

    const again = await asAdmin(ADMIN_2, (client) =>
      client.query(
        `select public.record_in_person_identity_verification($1, true) as result`,
        [MEMBER]
      )
    )
    expect(again.rows[0].result.already_verified).toBe(true)
    expect(again.rows[0].result.id).toBe(recorded.rows[0].result.id)

    const active = await query(
      `select status, approved_by, approved_at, source
       from public.in_person_identity_verifications
       where profile_id = $1 and revoked_at is null`,
      [MEMBER]
    )
    expect(active.rows).toHaveLength(1)
    expect(active.rows[0]).toMatchObject({
      status: 'verified',
      approved_by: ADMIN,
      source: 'admin_action',
    })
    expect(active.rows[0].approved_at).toBeTruthy()

    const recordAudits = await query(
      `select actor_id, action_type
       from public.moderation_actions
       where target_member_id = $1
         and action_type = 'in_person_identity_verified'`,
      [MEMBER]
    )
    expect(recordAudits.rows).toEqual([
      { actor_id: ADMIN, action_type: 'in_person_identity_verified' },
    ])

    const revoked = await asAdmin(ADMIN_2, (client) =>
      client.query(
        `select public.revoke_in_person_identity_verification($1, $2) as result`,
        [MEMBER, 'Wrong member was checked.']
      )
    )
    expect(revoked.rows[0].result.id).toBe(recorded.rows[0].result.id)

    await expect(
      asAdmin(ADMIN, (client) =>
        client.query(
          `select public.revoke_in_person_identity_verification($1, $2)`,
          [MEMBER, 'Already revoked.']
        )
      )
    ).rejects.toThrow(/No in-person identity verification is active/)

    const history = await query(
      `select status, approved_by, approved_at, revoked_by, revoked_at
       from public.in_person_identity_verifications
       where id = $1`,
      [recorded.rows[0].result.id]
    )
    expect(history.rows[0]).toMatchObject({
      status: 'revoked',
      approved_by: ADMIN,
      revoked_by: ADMIN_2,
    })
    expect(history.rows[0].approved_at).toBeTruthy()
    expect(history.rows[0].revoked_at).toBeTruthy()

    const revokeAudits = await query(
      `select actor_id, reason
       from public.moderation_actions
       where source_id = $1
         and action_type = 'in_person_identity_revoked'`,
      [recorded.rows[0].result.id]
    )
    expect(revokeAudits.rows).toEqual([
      { actor_id: ADMIN_2, reason: 'Wrong member was checked.' },
    ])

    const profile = await query(
      `select application_status, identity_verification_status, messaging_suspended_at, membership_billing
       from public.profiles where id = $1`,
      [MEMBER]
    )
    expect(profile.rows[0]).toMatchObject({
      application_status: 'approved',
      identity_verification_status: 'not_started',
      messaging_suspended_at: null,
    })
  })

  it('denies signed-out and non-admin direct calls', async () => {
    await expect(
      asRole('anon', null, (client) =>
        client.query(
          `select public.record_in_person_identity_verification($1, true)`,
          [PLAIN_MEMBER]
        )
      )
    ).rejects.toThrow(/permission denied/i)

    await expect(
      asRole('authenticated', null, (client) =>
        client.query(
          `select public.record_in_person_identity_verification($1, true)`,
          [PLAIN_MEMBER]
        )
      )
    ).rejects.toThrow(/authentication required/)

    await expect(
      asRole('authenticated', PLAIN_MEMBER, (client) =>
        client.query(
          `select public.record_in_person_identity_verification($1, true)`,
          [MEMBER]
        )
      )
    ).rejects.toThrow(/Administrator access required/)

    await expect(
      asRole('authenticated', PLAIN_MEMBER, (client) =>
        client.query(
          `select public.revoke_in_person_identity_verification($1, $2)`,
          [MEMBER, 'A member cannot revoke this.']
        )
      )
    ).rejects.toThrow(/Administrator access required/)

    const rows = await query(
      `select count(*)::int as count
       from public.in_person_identity_verifications
       where profile_id = $1`,
      [PLAIN_MEMBER]
    )
    expect(rows.rows[0].count).toBe(0)
  })

  it('rolls back a recording when the audit insert fails', async () => {
    await query(`
      create or replace function public.test_fail_in_person_audit()
      returns trigger
      language plpgsql
      as $fn$
      begin
        raise exception 'forced audit failure';
      end;
      $fn$;
      create trigger test_fail_in_person_audit
      before insert on public.moderation_actions
      for each row
      execute function public.test_fail_in_person_audit();
    `)
    try {
      await expect(
        asAdmin(ADMIN, (client) =>
          client.query(
            `select public.record_in_person_identity_verification($1, true)`,
            [FAIL_RECORD_MEMBER]
          )
        )
      ).rejects.toThrow(/forced audit failure/)
    } finally {
      await query(`
        drop trigger test_fail_in_person_audit on public.moderation_actions;
        drop function public.test_fail_in_person_audit();
      `)
    }

    const rows = await query(
      `select count(*)::int as count
       from public.in_person_identity_verifications
       where profile_id = $1`,
      [FAIL_RECORD_MEMBER]
    )
    const audits = await query(
      `select count(*)::int as count
       from public.moderation_actions
       where target_member_id = $1`,
      [FAIL_RECORD_MEMBER]
    )
    expect(rows.rows[0].count).toBe(0)
    expect(audits.rows[0].count).toBe(0)
  })

  it('rolls back a revocation when the audit insert fails', async () => {
    const recorded = await asAdmin(ADMIN, (client) =>
      client.query(
        `select public.record_in_person_identity_verification($1, true) as result`,
        [FAIL_REVOKE_MEMBER]
      )
    )
    const id = recorded.rows[0].result.id
    await query(`
      create or replace function public.test_fail_in_person_audit()
      returns trigger
      language plpgsql
      as $fn$
      begin
        if new.action_type = 'in_person_identity_revoked' then
          raise exception 'forced audit failure';
        end if;
        return new;
      end;
      $fn$;
      create trigger test_fail_in_person_audit
      before insert on public.moderation_actions
      for each row
      execute function public.test_fail_in_person_audit();
    `)
    try {
      await expect(
        asAdmin(ADMIN_2, (client) =>
          client.query(
            `select public.revoke_in_person_identity_verification($1, $2)`,
            [FAIL_REVOKE_MEMBER, 'This reason must not stick.']
          )
        )
      ).rejects.toThrow(/forced audit failure/)
    } finally {
      await query(`
        drop trigger test_fail_in_person_audit on public.moderation_actions;
        drop function public.test_fail_in_person_audit();
      `)
    }

    const row = await query(
      `select status, revoked_at, revoked_by, approved_by
       from public.in_person_identity_verifications
       where id = $1`,
      [id]
    )
    expect(row.rows[0]).toMatchObject({
      status: 'verified',
      revoked_at: null,
      revoked_by: null,
      approved_by: ADMIN,
    })
    const audits = await query(
      `select action_type, reason
       from public.moderation_actions
       where source_id = $1
       order by action_type`,
      [id]
    )
    expect(audits.rows).toEqual([
      { action_type: 'in_person_identity_verified', reason: null },
    ])
  })

  it('leaves one active record and one audit when recording runs concurrently', async () => {
    const results = await Promise.all([
      asAdmin(ADMIN, (client) =>
        client.query(
          `select public.record_in_person_identity_verification($1, true) as result`,
          [RACE_MEMBER]
        )
      ),
      asAdmin(ADMIN_2, (client) =>
        client.query(
          `select public.record_in_person_identity_verification($1, true) as result`,
          [RACE_MEMBER]
        )
      ),
    ])
    const flags = results.map((result) => result.rows[0].result.already_verified)
    expect(flags.filter((flag) => flag === false)).toHaveLength(1)
    expect(flags.filter((flag) => flag === true)).toHaveLength(1)

    const active = await query(
      `select approved_by
       from public.in_person_identity_verifications
       where profile_id = $1 and revoked_at is null`,
      [RACE_MEMBER]
    )
    expect(active.rows).toHaveLength(1)
    const audits = await query(
      `select actor_id
       from public.moderation_actions
       where target_member_id = $1
         and action_type = 'in_person_identity_verified'`,
      [RACE_MEMBER]
    )
    expect(audits.rows).toHaveLength(1)
    expect(audits.rows[0].actor_id).toBe(active.rows[0].approved_by)
  })

  it('lets one concurrent revocation win and writes only that audit', async () => {
    await asAdmin(ADMIN, (client) =>
      client.query(
        `select public.record_in_person_identity_verification($1, true)`,
        [REVOKE_MEMBER]
      )
    )
    const results = await Promise.allSettled([
      asAdmin(ADMIN, (client) =>
        client.query(
          `select public.revoke_in_person_identity_verification($1, $2)`,
          [REVOKE_MEMBER, 'First admin revocation.']
        )
      ),
      asAdmin(ADMIN_2, (client) =>
        client.query(
          `select public.revoke_in_person_identity_verification($1, $2)`,
          [REVOKE_MEMBER, 'Second admin revocation.']
        )
      ),
    ])
    const fulfilled = results.filter((result) => result.status === 'fulfilled')
    const rejected = results.filter((result) => result.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(messageOf((rejected[0] as PromiseRejectedResult).reason)).toMatch(
      /No in-person identity verification is active/
    )

    const row = await query(
      `select status, revoked_by
       from public.in_person_identity_verifications
       where profile_id = $1`,
      [REVOKE_MEMBER]
    )
    expect(row.rows).toHaveLength(1)
    expect(row.rows[0].status).toBe('revoked')
    const audits = await query(
      `select actor_id, reason
       from public.moderation_actions
       where target_member_id = $1
         and action_type = 'in_person_identity_revoked'`,
      [REVOKE_MEMBER]
    )
    expect(audits.rows).toHaveLength(1)
    expect(audits.rows[0].actor_id).toBe(row.rows[0].revoked_by)
    expect([
      'First admin revocation.',
      'Second admin revocation.',
    ]).toContain(audits.rows[0].reason)
  })

  it('reads the same request claims as auth.uid and ignores a caller-supplied actor id', async () => {
    const claimsOnly = new Client({ connectionString: testDatabaseUrl })
    await claimsOnly.connect()
    try {
      await claimsOnly.query('begin')
      await claimsOnly.query(
        `select set_config('request.jwt.claim.sub', ''::text, true),
                set_config('request.jwt.claim.role', ''::text, true),
                set_config('request.jwt.claims', $1, true),
                set_config('app.current_user_id', $2, true)`,
        [
          JSON.stringify({ sub: ADMIN, role: 'authenticated' }),
          PLAIN_MEMBER,
        ]
      )
      await claimsOnly.query('set local role authenticated')
      const recorded = await claimsOnly.query(
        `select public.record_in_person_identity_verification($1, true) as result`,
        [CLAIMS_MEMBER]
      )
      const compared = await claimsOnly.query(
        `select auth.uid() as auth_uid, auth.role() as auth_role`
      )
      await claimsOnly.query('commit')
      expect(compared.rows[0]).toEqual({
        auth_uid: ADMIN,
        auth_role: 'authenticated',
      })
      const stored = await query(
        `select approved_by from public.in_person_identity_verifications
         where id = $1`,
        [recorded.rows[0].result.id]
      )
      expect(stored.rows[0].approved_by).toBe(ADMIN)
    } finally {
      await claimsOnly.end()
    }

    const spoofed = new Client({ connectionString: testDatabaseUrl })
    await spoofed.connect()
    try {
      await spoofed.query('begin')
      await spoofed.query(
        `select set_config('request.jwt.claim.sub', ''::text, true),
                set_config('request.jwt.claim.role', 'authenticated', true),
                set_config('request.jwt.claims', ''::text, true),
                set_config('app.current_user_id', $1, true)`,
        [ADMIN]
      )
      await spoofed.query('set local role authenticated')
      await expect(
        spoofed.query(
          `select public.record_in_person_identity_verification($1, true)`,
          [PLAIN_MEMBER]
        )
      ).rejects.toThrow(/authentication required/)
      await spoofed.query('rollback')
    } finally {
      await spoofed.end()
    }
  })

  it('keeps Stripe acceptance after in-person revocation and ignores a spoofed target', async () => {
    await asAdmin(ADMIN, (client) =>
      client.query(
        `select public.record_in_person_identity_verification($1, true)`,
        [STRIPE_MEMBER]
      )
    )
    await asAdmin(ADMIN, (client) =>
      client.query(
        `select public.revoke_in_person_identity_verification($1, $2)`,
        [STRIPE_MEMBER, 'In-person check withdrawn.']
      )
    )
    const profile = await query(
      `select application_status, identity_verification_status, messaging_suspended_at,
              public.profile_has_accepted_identity(id) as accepted
       from public.profiles
       where id = $1`,
      [STRIPE_MEMBER]
    )
    expect(profile.rows[0]).toMatchObject({
      application_status: 'approved',
      identity_verification_status: 'verified',
      messaging_suspended_at: null,
      accepted: true,
    })

    await expect(
      asAdmin(ADMIN, (client) =>
        client.query(
          `select public.record_in_person_identity_verification($1, true)`,
          ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']
        )
      )
    ).rejects.toThrow(/Member not found/)

    await expect(
      asAdmin(PLAIN_MEMBER, (client) =>
        client.query(
          `select public.record_in_person_identity_verification($1, true)`,
          [ADMIN]
        )
      )
    ).rejects.toThrow(/Administrator access required/)
  })

  it('shows that service_role can still write the table directly', async () => {
    await asRole('service_role', null, (client) =>
      client.query(
        `insert into public.in_person_identity_verifications (
           profile_id, method, status, source, approved_by, approved_at
         ) values ($1, 'in_person', 'verified', 'admin_action', $2, now())`,
        [PLAIN_MEMBER, ADMIN]
      )
    )
    const audits = await query(
      `select count(*)::int as count
       from public.moderation_actions
       where target_member_id = $1`,
      [PLAIN_MEMBER]
    )
    expect(audits.rows[0].count).toBe(0)
    await expect(
      asRole('service_role', ADMIN, (client) =>
        client.query(
          `select public.record_in_person_identity_verification($1, true)`,
          [PLAIN_MEMBER]
        )
      )
    ).rejects.toThrow(/permission denied/i)
  })
})
