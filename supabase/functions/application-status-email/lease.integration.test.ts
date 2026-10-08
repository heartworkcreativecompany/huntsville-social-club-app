import { readFileSync } from 'node:fs'
import path from 'node:path'
import { Client, type QueryResult } from 'pg'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import {
  LEASE_TEST_DATABASE_NAME,
  LEASE_TEST_MAINTENANCE_DATABASE,
  assertLeaseDestructiveTestAllowed,
  leaseMaintenanceDatabaseUrl,
  type LeaseTestTarget,
} from './lease-test-guard.ts'

/**
 * Disposable-database suite. Excluded from `npm test`.
 * Setup and teardown: lease-integration.md.
 * The only destructive statements are the fixed DROP/CREATE DATABASE
 * statements below. They never target schema public on the maintenance
 * database.
 */
const MIGRATION_PATH = path.join(
  process.cwd(),
  'supabase/migrations/20261007120000_application_email_attempt_lease.sql'
)
const TERMINATE_DISPOSABLE_BACKENDS_SQL = `
  select pg_terminate_backend(pid)
  from pg_stat_activity
  where datname = 'hsc_application_email_lease_test'
    and pid <> pg_backend_pid()
`
const DROP_DISPOSABLE_DATABASE_SQL =
  'drop database if exists hsc_application_email_lease_test'
const CREATE_DISPOSABLE_DATABASE_SQL =
  'create database hsc_application_email_lease_test'

const APP_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
const APP_B = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
const APP_C = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'

let admin: Client | null = null
let testDatabaseUrl = ''
let disposableDatabaseReady = false

type LeaseRow = {
  id: string
  processing_state: string
  claim_token: string | null
  claimed_until: string | null
  attempt_count: number
  next_attempt_at: string | null
  delivery_status: string
  error_message: string | null
  resend_email_id: string | null
  recipient_email?: string | null
}

async function query(sql: string, values: unknown[] = []): Promise<QueryResult> {
  if (!admin) throw new Error('disposable test database is not connected')
  return admin.query(sql, values)
}

async function asService<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  if (!testDatabaseUrl) throw new Error('disposable test database is not connected')
  const client = new Client({ connectionString: testDatabaseUrl })
  await client.connect()
  try {
    await client.query('set role service_role')
    return await fn(client)
  } finally {
    await client.query('reset role').catch(() => undefined)
    await client.end()
  }
}

function rowFrom(result: { row?: LeaseRow | null } | null): LeaseRow | null {
  return result?.row ?? null
}

async function insertProfile(id: string) {
  await query('insert into public.profiles (id) values ($1) on conflict do nothing', [
    id,
  ])
}

async function insertAttempt(input: {
  applicationId: string
  eventKey: string
  state: string
  attemptCount: number
  nextAttemptAt: string | null
  claimedUntil?: string | null
  claimToken?: string | null
  deliveryStatus?: string
  submissionVersion?: number | null
  resendEventName?: string | null
}) {
  await insertProfile(input.applicationId)
  const inserted = await query(
    `insert into public.application_email_log (
      application_id, recipient_user_id, recipient_email, event_key,
      application_status, delivery_status, error_message, provider_event,
      processing_state, attempt_count, next_attempt_at, claimed_until,
      claim_token, submission_version, resend_event_name
    ) values (
      $1, $1, 'applicant@example.com', $2,
      'submitted', $3, null, '{}'::jsonb,
      $4, $5, $6, $7,
      $8, $9, $10
    ) returning id`,
    [
      input.applicationId,
      input.eventKey,
      input.deliveryStatus ?? 'queued',
      input.state,
      input.attemptCount,
      input.nextAttemptAt,
      input.claimedUntil ?? null,
      input.claimToken ?? null,
      input.submissionVersion === undefined ? 1 : input.submissionVersion,
      input.resendEventName === undefined
        ? 'application_submitted'
        : input.resendEventName,
    ]
  )
  return inserted.rows[0].id as string
}

async function withMaintenance<T>(
  target: LeaseTestTarget,
  fn: (client: Client) => Promise<T>
): Promise<T> {
  const allowed = assertLeaseDestructiveTestAllowed()
  if (
    allowed.databaseName !== target.databaseName ||
    allowed.databaseUrl !== target.databaseUrl
  ) {
    throw new Error('Refusing destructive lease SQL: target changed before connect.')
  }
  const client = new Client({
    connectionString: leaseMaintenanceDatabaseUrl(allowed),
  })
  await client.connect()
  try {
    const current = await client.query('select current_database() as name')
    const name = String(current.rows[0]?.name ?? '')
    if (
      name !== LEASE_TEST_MAINTENANCE_DATABASE ||
      name === LEASE_TEST_DATABASE_NAME
    ) {
      throw new Error(
        'Refusing destructive lease SQL: maintenance connection is not the postgres database.'
      )
    }
    return await fn(client)
  } finally {
    await client.end()
  }
}

async function replaceDisposableDatabase(target: LeaseTestTarget) {
  await withMaintenance(target, async (client) => {
    await client.query(TERMINATE_DISPOSABLE_BACKENDS_SQL)
    await client.query(DROP_DISPOSABLE_DATABASE_SQL)
    await client.query(CREATE_DISPOSABLE_DATABASE_SQL)
  })
  disposableDatabaseReady = true
}

async function dropDisposableDatabase(target: LeaseTestTarget) {
  await withMaintenance(target, async (client) => {
    await client.query(TERMINATE_DISPOSABLE_BACKENDS_SQL)
    await client.query(DROP_DISPOSABLE_DATABASE_SQL)
  })
  disposableDatabaseReady = false
}

beforeAll(async () => {
  const target = assertLeaseDestructiveTestAllowed()
  await replaceDisposableDatabase(target)
  testDatabaseUrl = target.databaseUrl
  admin = new Client({ connectionString: testDatabaseUrl })
  await admin.connect()
  const current = await admin.query('select current_database() as name')
  if (String(current.rows[0]?.name ?? '') !== LEASE_TEST_DATABASE_NAME) {
    throw new Error(
      'Refusing fixture SQL: connected database is not the disposable test database.'
    )
  }
  await query('grant usage on schema public to public')
  await query(`
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon nologin;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then
        create role service_role nologin;
      end if;
    end
    $$;
  `)
  await query(`
    create or replace function public.set_updated_at()
    returns trigger
    language plpgsql
    as $$
    begin
      new.updated_at = now();
      return new;
    end;
    $$;
  `)
  await query(`
    create table public.profiles (
      id uuid primary key
    );
  `)
  await query(`
    create table public.application_email_log (
      id uuid primary key default gen_random_uuid(),
      application_id uuid not null references public.profiles (id) on delete cascade,
      recipient_user_id uuid not null references public.profiles (id) on delete cascade,
      recipient_email text not null,
      event_key text not null,
      application_status text not null,
      resend_email_id text,
      delivery_status text not null,
      error_message text,
      provider_event jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint application_email_log_application_id_event_key_key
        unique (application_id, event_key),
      constraint application_email_log_event_key_check
        check (length(trim(event_key)) > 0),
      constraint application_email_log_application_status_check
        check (application_status = any (array[
          'draft', 'submitted', 'in_review', 'needs_info', 'approved', 'rejected'
        ]::text[])),
      constraint application_email_log_delivery_status_check
        check (delivery_status = any (array[
          'queued', 'sent', 'failed', 'skipped', 'bounced'
        ]::text[]))
    );
  `)
  await query(`
    create trigger set_application_email_log_updated_at
    before update on public.application_email_log
    for each row execute function public.set_updated_at();
  `)
  await query(readFileSync(MIGRATION_PATH, 'utf8'))
})

beforeEach(async () => {
  await query('truncate public.application_email_log, public.profiles cascade')
})

afterAll(async () => {
  if (admin) {
    await admin.end()
    admin = null
  }
  if (!disposableDatabaseReady) return
  const target = assertLeaseDestructiveTestAllowed()
  await dropDisposableDatabase(target)
})

it('never acquires an exhausted row whose next_attempt_at is null', async () => {
  const id = await insertAttempt({
    applicationId: APP_A,
    eventKey: 'application_submitted:1',
    state: 'contact_sync_failed',
    attemptCount: 5,
    nextAttemptAt: null,
  })
  const acquired = await asService(async (client) => {
    const byId = await client.query(
      'select public.acquire_application_email_lease($1, 30) as result',
      [id]
    )
    const next = await client.query(
      'select public.acquire_next_application_email_lease(30) as result'
    )
    return {
      byId: rowFrom(byId.rows[0].result),
      next: rowFrom(next.rows[0].result),
    }
  })
  expect(acquired.byId).toBeNull()
  expect(acquired.next).toBeNull()
})

it('never acquires a future-scheduled row early', async () => {
  const id = await insertAttempt({
    applicationId: APP_A,
    eventKey: 'application_submitted:1',
    state: 'contact_sync_pending',
    attemptCount: 1,
    nextAttemptAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  })
  const acquired = await asService(async (client) => {
    const byId = await client.query(
      'select public.acquire_application_email_lease($1, 30) as result',
      [id]
    )
    const next = await client.query(
      'select public.acquire_next_application_email_lease(30) as result'
    )
    return {
      byId: rowFrom(byId.rows[0].result),
      next: rowFrom(next.rows[0].result),
    }
  })
  expect(acquired.byId).toBeNull()
  expect(acquired.next).toBeNull()
})

it('lets the owner move failed and missing-name rows back to pending', async () => {
  const failedId = await insertAttempt({
    applicationId: APP_A,
    eventKey: 'failed:1',
    state: 'contact_sync_failed',
    attemptCount: 2,
    nextAttemptAt: new Date(Date.now() - 1000).toISOString(),
  })
  const missingId = await insertAttempt({
    applicationId: APP_B,
    eventKey: 'missing:1',
    state: 'missing_first_name',
    attemptCount: 3,
    nextAttemptAt: new Date(Date.now() - 1000).toISOString(),
  })

  const moved = await asService(async (client) => {
    const failedLease = rowFrom(
      (
        await client.query(
          'select public.acquire_application_email_lease($1, 30) as result',
          [failedId]
        )
      ).rows[0].result
    )
    const missingLease = rowFrom(
      (
        await client.query(
          'select public.acquire_application_email_lease($1, 30) as result',
          [missingId]
        )
      ).rows[0].result
    )
    if (!failedLease?.claim_token || !missingLease?.claim_token) {
      throw new Error('expected both due rows to be acquired')
    }
    const failedPending = rowFrom(
      (
        await client.query(
          `select public.transition_application_email_attempt(
            $1, $2, 'contact_sync_failed', 'contact_sync_pending',
            $3, now(), null, 'queued', null, '{"stage":"pending"}'::jsonb, 30, false
          ) as result`,
          [failedId, failedLease.claim_token, failedLease.attempt_count]
        )
      ).rows[0].result
    )
    const missingPending = rowFrom(
      (
        await client.query(
          `select public.transition_application_email_attempt(
            $1, $2, 'missing_first_name', 'contact_sync_pending',
            $3, now(), null, 'queued', null, '{"stage":"pending"}'::jsonb, 30, false
          ) as result`,
          [missingId, missingLease.claim_token, missingLease.attempt_count]
        )
      ).rows[0].result
    )
    return { failedPending, missingPending, failedLease, missingLease }
  })

  expect(moved.failedPending?.processing_state).toBe('contact_sync_pending')
  expect(moved.failedPending?.claim_token).toBe(moved.failedLease.claim_token)
  expect(moved.failedPending?.next_attempt_at).not.toBeNull()
  expect(moved.missingPending?.processing_state).toBe('contact_sync_pending')
  expect(moved.missingPending?.claim_token).toBe(moved.missingLease.claim_token)
  expect(moved.missingPending?.next_attempt_at).not.toBeNull()
})

it('replaces an expired lease and rejects the stale owner token', async () => {
  const id = await insertAttempt({
    applicationId: APP_A,
    eventKey: 'application_submitted:1',
    state: 'contact_sync_pending',
    attemptCount: 0,
    nextAttemptAt: new Date(Date.now() - 1000).toISOString(),
  })
  const first = await asService(async (client) =>
    rowFrom(
      (
        await client.query(
          'select public.acquire_application_email_lease($1, 30) as result',
          [id]
        )
      ).rows[0].result
    )
  )
  expect(first?.claim_token).toBeTruthy()
  await query(
    `update public.application_email_log
     set claimed_until = now() - interval '1 second'
     where id = $1`,
    [id]
  )
  const second = await asService(async (client) => {
    const leased = rowFrom(
      (
        await client.query(
          'select public.acquire_application_email_lease($1, 30) as result',
          [id]
        )
      ).rows[0].result
    )
    const stale = rowFrom(
      (
        await client.query(
          `select public.transition_application_email_attempt(
            $1, $2, 'contact_sync_pending', 'obsolete',
            0, null, 'obsolete', 'skipped', null, '{"category":"obsolete"}'::jsonb,
            null, true
          ) as result`,
          [id, first?.claim_token]
        )
      ).rows[0].result
    )
    return { leased, stale }
  })
  expect(second.leased?.claim_token).toBeTruthy()
  expect(second.leased?.claim_token).not.toBe(first?.claim_token)
  expect(second.stale).toBeNull()
})

it('gives concurrent acquire-next calls different rows', async () => {
  await insertAttempt({
    applicationId: APP_A,
    eventKey: 'one:1',
    state: 'contact_sync_pending',
    attemptCount: 0,
    nextAttemptAt: new Date(Date.now() - 2000).toISOString(),
  })
  await insertAttempt({
    applicationId: APP_B,
    eventKey: 'two:1',
    state: 'contact_sync_failed',
    attemptCount: 1,
    nextAttemptAt: new Date(Date.now() - 1000).toISOString(),
  })
  const left = new Client({ connectionString: testDatabaseUrl })
  const right = new Client({ connectionString: testDatabaseUrl })
  await left.connect()
  await right.connect()
  try {
    await left.query('set role service_role')
    await right.query('set role service_role')
    await left.query('begin')
    await right.query('begin')
    const [leftResult, rightResult] = await Promise.all([
      left.query('select public.acquire_next_application_email_lease(30) as result'),
      right.query('select public.acquire_next_application_email_lease(30) as result'),
    ])
    await left.query('commit')
    await right.query('commit')
    const leftId = rowFrom(leftResult.rows[0].result)?.id
    const rightId = rowFrom(rightResult.rows[0].result)?.id
    expect(leftId).toBeTruthy()
    expect(rightId).toBeTruthy()
    expect(leftId).not.toBe(rightId)
  } finally {
    await left.end()
    await right.end()
  }
})

it('lets a late owner token lose to the sweeper without another send state', async () => {
  const id = await insertAttempt({
    applicationId: APP_A,
    eventKey: 'application_submitted:1',
    state: 'contact_sync_pending',
    attemptCount: 0,
    nextAttemptAt: new Date(Date.now() - 1000).toISOString(),
  })
  const leased = await asService(async (client) =>
    rowFrom(
      (
        await client.query(
          'select public.acquire_application_email_lease($1, 30) as result',
          [id]
        )
      ).rows[0].result
    )
  )
  const submitting = await asService(async (client) =>
    rowFrom(
      (
        await client.query(
          `select public.transition_application_email_attempt(
            $1, $2, 'contact_sync_pending', 'event_submitting',
            $3, null, null, 'queued', null, '{"category":"event_submitting"}'::jsonb,
            20, false
          ) as result`,
          [id, leased?.claim_token, leased?.attempt_count]
        )
      ).rows[0].result
    )
  )
  expect(submitting?.processing_state).toBe('event_submitting')
  await query(
    `update public.application_email_log
     set claimed_until = now() - interval '1 second'
     where id = $1`,
    [id]
  )
  const swept = await asService(async (client) => {
    const count = await client.query(
      'select public.sweep_expired_event_submissions(25) as swept'
    )
    const late = rowFrom(
      (
        await client.query(
          `select public.transition_application_email_attempt(
            $1, $2, 'event_submitting', 'event_accepted',
            $3, null, null, 'unconfirmed', null, '{"category":"event_accepted"}'::jsonb,
            null, true
          ) as result`,
          [id, leased?.claim_token, leased?.attempt_count]
        )
      ).rows[0].result
    )
    return { swept: count.rows[0].swept as number, late }
  })
  expect(swept.swept).toBe(1)
  expect(swept.late).toBeNull()
  const stored = await query(
    `select processing_state, next_attempt_at, claim_token, delivery_status
     from public.application_email_log where id = $1`,
    [id]
  )
  expect(stored.rows[0]).toMatchObject({
    processing_state: 'event_submission_unknown',
    next_attempt_at: null,
    claim_token: null,
    delivery_status: 'unconfirmed',
  })
})

it('does not sweep an event submission whose lease is still held', async () => {
  const id = await insertAttempt({
    applicationId: APP_A,
    eventKey: 'application_submitted:1',
    state: 'contact_sync_pending',
    attemptCount: 0,
    nextAttemptAt: new Date(Date.now() - 1000).toISOString(),
  })
  const outcome = await asService(async (client) => {
    const leased = rowFrom(
      (
        await client.query(
          'select public.acquire_application_email_lease($1, 30) as result',
          [id]
        )
      ).rows[0].result
    )
    await client.query(
      `select public.transition_application_email_attempt(
        $1, $2, 'contact_sync_pending', 'event_submitting',
        $3, null, null, 'queued', null, '{"category":"event_submitting"}'::jsonb,
        20, false
      )`,
      [id, leased?.claim_token, leased?.attempt_count]
    )
    const swept = await client.query(
      'select public.sweep_expired_event_submissions(25) as swept'
    )
    const accepted = rowFrom(
      (
        await client.query(
          `select public.transition_application_email_attempt(
            $1, $2, 'event_submitting', 'event_accepted',
            $3, null, null, 'unconfirmed', null, '{"category":"event_accepted"}'::jsonb,
            null, true
          ) as result`,
          [id, leased?.claim_token, leased?.attempt_count]
        )
      ).rows[0].result
    )
    return { swept: swept.rows[0].swept as number, accepted }
  })
  expect(outcome.swept).toBe(0)
  expect(outcome.accepted?.processing_state).toBe('event_accepted')
  expect(outcome.accepted?.resend_email_id).toBeNull()
  expect(outcome.accepted?.next_attempt_at).toBeNull()
})

it('keeps an old handler insert historic and unscheduled', async () => {
  await insertProfile(APP_C)
  const inserted = await query(
    `insert into public.application_email_log (
      application_id, recipient_user_id, recipient_email, event_key,
      application_status, delivery_status, error_message, provider_event
    ) values (
      $1, $1, 'historic@example.com', 'application_submitted:1',
      'submitted', 'queued', null, '{"event":"application_submitted","stage":"claimed"}'::jsonb
    ) returning id, processing_state, next_attempt_at`,
    [APP_C]
  )
  expect(inserted.rows[0].processing_state).toBe('historic')
  expect(inserted.rows[0].next_attempt_at).toBeNull()
  const id = inserted.rows[0].id as string
  for (const deliveryStatus of ['sent', 'failed', 'skipped', 'bounced']) {
    await query(
      `update public.application_email_log
       set delivery_status = $2, resend_email_id = null, error_message = $2
       where id = $1`,
      [id, deliveryStatus]
    )
  }
  const stored = await query(
    `select processing_state, next_attempt_at, delivery_status
     from public.application_email_log where id = $1`,
    [id]
  )
  expect(stored.rows[0]).toMatchObject({
    processing_state: 'historic',
    next_attempt_at: null,
    delivery_status: 'bounced',
  })
  const next = await asService(async (client) =>
    rowFrom(
      (
        await client.query(
          'select public.acquire_next_application_email_lease(30) as result'
        )
      ).rows[0].result
    )
  )
  expect(next).toBeNull()
})

it('rejects historic and obsolete outbound transitions and anon or authenticated execution', async () => {
  const historicId = await insertAttempt({
    applicationId: APP_A,
    eventKey: 'historic:1',
    state: 'historic',
    attemptCount: 0,
    nextAttemptAt: null,
    submissionVersion: null,
    resendEventName: null,
    claimToken: '77777777-7777-4777-8777-777777777777',
    claimedUntil: new Date(Date.now() + 30_000).toISOString(),
  })
  const obsoleteId = await insertAttempt({
    applicationId: APP_B,
    eventKey: 'obsolete:1',
    state: 'obsolete',
    attemptCount: 1,
    nextAttemptAt: null,
    claimToken: '88888888-8888-4888-8888-888888888888',
    claimedUntil: new Date(Date.now() + 30_000).toISOString(),
  })
  const transitions = await asService(async (client) => {
    const historic = rowFrom(
      (
        await client.query(
          `select public.transition_application_email_attempt(
            $1, '77777777-7777-4777-8777-777777777777', 'historic', 'contact_sync_pending',
            0, now(), null, 'queued', null, '{}'::jsonb, 30, false
          ) as result`,
          [historicId]
        )
      ).rows[0].result
    )
    const obsolete = rowFrom(
      (
        await client.query(
          `select public.transition_application_email_attempt(
            $1, '88888888-8888-4888-8888-888888888888', 'obsolete', 'contact_sync_pending',
            1, now(), null, 'queued', null, '{}'::jsonb, 30, false
          ) as result`,
          [obsoleteId]
        )
      ).rows[0].result
    )
    return { historic, obsolete }
  })
  expect(transitions.historic).toBeNull()
  expect(transitions.obsolete).toBeNull()

  for (const role of ['anon', 'authenticated']) {
    const restricted = new Client({ connectionString: testDatabaseUrl })
    await restricted.connect()
    try {
      await restricted.query(`set role ${role}`)
      await expect(
        restricted.query('select public.acquire_next_application_email_lease(30)')
      ).rejects.toThrow(/permission denied/i)
    } finally {
      await restricted.end()
    }
  }
})

it('stores a null recipient until the owner assigns one without changing the attempt count', async () => {
  await insertProfile(APP_A)
  const inserted = await asService(async (client) =>
    rowFrom(
      (
        await client.query(
          `select public.insert_application_email_pending(
            $1, null, 'application_submitted:1', 'submitted', 'application_submitted', 1
          ) as result`,
          [APP_A]
        )
      ).rows[0].result
    )
  )
  expect(inserted?.recipient_email ?? null).toBeNull()
  expect(inserted?.attempt_count).toBe(0)
  const id = inserted?.id
  if (!id) throw new Error('expected the pending row')

  const leased = await asService(async (client) =>
    rowFrom(
      (
        await client.query(
          'select public.acquire_application_email_lease($1, 30) as result',
          [id]
        )
      ).rows[0].result
    )
  )
  expect(leased?.attempt_count).toBe(1)
  expect(leased?.recipient_email ?? null).toBeNull()

  const assigned = await asService(async (client) =>
    rowFrom(
      (
        await client.query(
          `select public.assign_application_email_recipient($1, $2, 'applicant@example.com') as result`,
          [id, leased?.claim_token]
        )
      ).rows[0].result
    )
  )
  expect(assigned?.recipient_email).toBe('applicant@example.com')
  expect(assigned?.attempt_count).toBe(1)
  expect(assigned?.claim_token).toBe(leased?.claim_token)

  const stale = await asService(async (client) =>
    rowFrom(
      (
        await client.query(
          `select public.assign_application_email_recipient(
            $1, '99999999-9999-4999-8999-999999999999', 'other@example.com'
          ) as result`,
          [id]
        )
      ).rows[0].result
    )
  )
  expect(stale).toBeNull()
  const stored = await query(
    'select recipient_email, attempt_count from public.application_email_log where id = $1',
    [id]
  )
  expect(stored.rows[0].recipient_email).toBe('applicant@example.com')
  expect(stored.rows[0].attempt_count).toBe(1)
})

it('counts an expired pre-send lease and stops at five without a sixth acquire', async () => {
  const id = await insertAttempt({
    applicationId: APP_A,
    eventKey: 'expiry-cap:1',
    state: 'contact_sync_pending',
    attemptCount: 0,
    nextAttemptAt: new Date(Date.now() - 1000).toISOString(),
  })
  let lastToken: string | null = null
  for (let expected = 1; expected <= 5; expected += 1) {
    const leased = await asService(async (client) =>
      rowFrom(
        (
          await client.query(
            'select public.acquire_application_email_lease($1, 30) as result',
            [id]
          )
        ).rows[0].result
      )
    )
    expect(leased?.attempt_count).toBe(expected)
    if (expected < 5) expect(leased?.next_attempt_at).not.toBeNull()
    else expect(leased?.next_attempt_at).toBeNull()
    lastToken = leased?.claim_token ?? null
    await query(
      `update public.application_email_log
       set claimed_until = now() - interval '1 second'
       where id = $1`,
      [id]
    )
  }

  const sixth = await asService(async (client) =>
    rowFrom(
      (
        await client.query(
          'select public.acquire_application_email_lease($1, 30) as result',
          [id]
        )
      ).rows[0].result
    )
  )
  expect(sixth).toBeNull()
  const stored = await query(
    `select attempt_count, next_attempt_at, processing_state
     from public.application_email_log where id = $1`,
    [id]
  )
  expect(stored.rows[0].attempt_count).toBe(5)
  expect(stored.rows[0].next_attempt_at).toBeNull()
  expect(stored.rows[0].processing_state).toBe('contact_sync_pending')

  const stale = await asService(async (client) =>
    rowFrom(
      (
        await client.query(
          `select public.transition_application_email_attempt(
            $1, $2, 'contact_sync_pending', 'contact_sync_failed',
            1, now(), 'contact_sync_failed', 'queued', null, '{"category":"contact_sync_failed"}'::jsonb,
            null, true
          ) as result`,
          [id, lastToken]
        )
      ).rows[0].result
    )
  )
  expect(stale).toBeNull()
  const afterStale = await query(
    'select attempt_count from public.application_email_log where id = $1',
    [id]
  )
  expect(afterStale.rows[0].attempt_count).toBe(5)
})

it('does not let a concurrent or live owner rewrite the acquired attempt count', async () => {
  const id = await insertAttempt({
    applicationId: APP_A,
    eventKey: 'fence:1',
    state: 'contact_sync_failed',
    attemptCount: 2,
    nextAttemptAt: new Date(Date.now() - 1000).toISOString(),
  })
  const left = new Client({ connectionString: testDatabaseUrl })
  const right = new Client({ connectionString: testDatabaseUrl })
  await left.connect()
  await right.connect()
  let winnerToken = ''
  try {
    await left.query('set role service_role')
    await right.query('set role service_role')
    const winner = rowFrom(
      (
        await left.query(
          'select public.acquire_application_email_lease($1, 30) as result',
          [id]
        )
      ).rows[0].result
    )
    const loser = rowFrom(
      (
        await right.query(
          'select public.acquire_application_email_lease($1, 30) as result',
          [id]
        )
      ).rows[0].result
    )
    expect(winner?.attempt_count).toBe(3)
    expect(winner?.claim_token).toBeTruthy()
    expect(loser).toBeNull()
    winnerToken = winner?.claim_token ?? ''
  } finally {
    await left.end()
    await right.end()
  }

  const rewritten = await asService(async (client) =>
    rowFrom(
      (
        await client.query(
          `select public.transition_application_email_attempt(
            $1, $2, 'contact_sync_failed', 'contact_sync_pending',
            4, now(), null, 'queued', null, '{"stage":"pending"}'::jsonb, 30, false
          ) as result`,
          [id, winnerToken]
        )
      ).rows[0].result
    )
  )
  expect(rewritten).toBeNull()
  const stored = await query(
    'select attempt_count, claim_token from public.application_email_log where id = $1',
    [id]
  )
  expect(stored.rows[0].attempt_count).toBe(3)
  expect(stored.rows[0].claim_token).toBe(winnerToken)

  const kept = await asService(async (client) =>
    rowFrom(
      (
        await client.query(
          `select public.transition_application_email_attempt(
            $1, $2, 'contact_sync_failed', 'contact_sync_pending',
            3, now(), null, 'queued', null, '{"stage":"pending"}'::jsonb, 30, false
          ) as result`,
          [id, winnerToken]
        )
      ).rows[0].result
    )
  )
  expect(kept?.attempt_count).toBe(3)
  expect(kept?.processing_state).toBe('contact_sync_pending')
})
