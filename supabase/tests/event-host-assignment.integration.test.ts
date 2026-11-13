import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

/**
 * Disposable loopback database only. Does not connect to the hosted project.
 */

const DATABASE_NAME = 'hsc_event_host_assignment_test'
const ADMIN = '11111111-1111-4111-8111-111111111111'
const CREATOR = '22222222-2222-4222-8222-222222222222'
const HOST = '33333333-3333-4333-8333-333333333333'
const COHOST = '44444444-4444-4444-8444-444444444444'
const MEMBER = '55555555-5555-4555-8555-555555555555'
const REMOVED = '66666666-6666-4666-8666-666666666666'
const EXISTING = '77777777-7777-4777-8777-777777777777'

function assertTarget() {
  if (process.env.EVENT_HOST_ASSIGNMENT_DESTRUCTIVE_TEST !== '1') {
    throw new Error('EVENT_HOST_ASSIGNMENT_DESTRUCTIVE_TEST=1 is required.')
  }
  const raw = process.env.EVENT_HOST_ASSIGNMENT_DATABASE_URL?.trim() ?? ''
  if (!raw) {
    throw new Error('EVENT_HOST_ASSIGNMENT_DATABASE_URL must name the disposable database.')
  }
  const url = new URL(raw)
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
    throw new Error('Event host SQL is limited to loopback.')
  }
  if (url.pathname !== `/${DATABASE_NAME}`) {
    throw new Error(`Event host SQL is limited to ${DATABASE_NAME}.`)
  }
  return raw
}

const databaseUrl = assertTarget()
const db = new Client({ connectionString: databaseUrl })

async function resetSession() {
  await db.query('RESET ROLE')
  await db.query(`select set_config('request.jwt.claim.sub', '', false)`)
}

async function asUser(userId: string | null) {
  await resetSession()
  if (!userId) return
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId])
  await db.query('set role authenticated')
}

describe('event host assignment database', () => {
  beforeAll(async () => {
    await db.connect()
    await db.query(`
      create schema if not exists auth;
      do $$ begin
        create role anon;
      exception when duplicate_object then null;
      end $$;
      do $$ begin
        create role authenticated;
      exception when duplicate_object then null;
      end $$;
      do $$ begin
        create role service_role;
      exception when duplicate_object then null;
      end $$;
      create or replace function auth.uid() returns uuid
      language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      drop table if exists public.event_additional_hosts;
      drop table if exists public.events;
      drop table if exists public.profiles;
      drop table if exists auth.users;
      create table auth.users (id uuid primary key);
      create table public.profiles (
        id uuid primary key references auth.users (id) on delete cascade,
        full_name text,
        role text not null,
        removed_at timestamptz
      );
      create table public.events (
        id uuid primary key default gen_random_uuid(),
        owner_id uuid not null references auth.users (id) on delete cascade,
        title text not null,
        location text,
        description text,
        starts_at timestamptz not null default now(),
        ends_at timestamptz,
        visibility text not null default 'public',
        status text not null default 'pending_approval',
        event_type text not null default 'standard_event',
        sponsorship_eligible boolean not null default false,
        attendance_max integer,
        cover_image_url text,
        rsvp_question text,
        rsvp_question_required boolean not null default false,
        listed_publicly boolean not null default false,
        fee_cents integer,
        priority_rsvp_opens_at timestamptz,
        general_rsvp_opens_at timestamptz,
        updated_at timestamptz not null default now()
      );
      insert into auth.users (id) values
        ('${ADMIN}'), ('${CREATOR}'), ('${HOST}'), ('${COHOST}'),
        ('${MEMBER}'), ('${REMOVED}'), ('${EXISTING}');
      insert into public.profiles (id, full_name, role) values
        ('${ADMIN}', 'Avery Admin', 'admin'),
        ('${CREATOR}', 'Morgan Member', 'member'),
        ('${HOST}', 'Riley Host', 'host'),
        ('${COHOST}', 'Casey CoHost', 'host'),
        ('${MEMBER}', 'Jamie Member', 'member'),
        ('${EXISTING}', 'Existing Creator', 'member');
      insert into public.profiles (id, full_name, role, removed_at) values
        ('${REMOVED}', 'Removed Host', 'host', now());
      insert into public.events (id, owner_id, title, status)
      values ('${EXISTING}', '${EXISTING}', 'Existing mixer', 'published');

      create or replace function public.is_admin(check_user_id uuid)
      returns boolean language sql stable security definer
      set search_path to public set row_security to off as $$
        select coalesce((
          select role = 'admin' from public.profiles where id = check_user_id limit 1
        ), false);
      $$;
      create or replace function public.is_host_or_admin(check_user_id uuid)
      returns boolean language sql stable security definer
      set search_path to public set row_security to off as $$
        select coalesce((
          select role = any (array['host', 'admin'])
          from public.profiles where id = check_user_id limit 1
        ), false);
      $$;
    `)

    const migration = readFileSync(
      join(process.cwd(), 'supabase/migrations/20261112140000_event_host_assignment.sql'),
      'utf8'
    )
    await db.query(migration)

    await db.query(`
      create or replace function public.events_enforce_approval_gates()
      returns trigger language plpgsql security definer set search_path = public as $$
      begin
        if public.is_host_or_admin(auth.uid()) then
          return new;
        end if;
        if tg_op = 'INSERT' then
          if new.event_type is distinct from 'standard_event' then
            raise exception 'Only hosts or admins can create non-standard events';
          end if;
          if new.status is distinct from 'pending_approval' then
            raise exception 'Member-created events must be submitted as pending_approval';
          end if;
        elsif tg_op = 'UPDATE' then
          if new.event_type is distinct from old.event_type then
            raise exception 'Only hosts or admins can change event type';
          end if;
          if new.status = 'published' and old.status is distinct from 'published' then
            raise exception 'Only admins can publish events that require approval';
          end if;
        end if;
        return new;
      end;
      $$;
      drop trigger if exists events_enforce_approval_gates on public.events;
      create trigger events_enforce_approval_gates
        before insert or update on public.events
        for each row execute function public.events_enforce_approval_gates();

      alter table public.events enable row level security;
      alter table public.profiles enable row level security;
      drop policy if exists "Admins can update any event" on public.events;
      create policy "Admins can update any event" on public.events
        for update to authenticated
        using (public.is_admin((select auth.uid())))
        with check (public.is_admin((select auth.uid())));
      drop policy if exists "Hosts can update their own events" on public.events;
      create policy "Hosts can update their own events" on public.events
        for update to authenticated
        using (owner_id = (select auth.uid()) and public.is_host_or_admin((select auth.uid())))
        with check (owner_id = (select auth.uid()) and public.is_host_or_admin((select auth.uid())));
      drop policy if exists "Members can update own standard events" on public.events;
      create policy "Members can update own standard events" on public.events
        for update to authenticated
        using (owner_id = (select auth.uid()) and not public.is_host_or_admin((select auth.uid())))
        with check (
          owner_id = (select auth.uid())
          and not public.is_host_or_admin((select auth.uid()))
          and event_type = 'standard_event'
          and status in ('draft', 'pending_approval', 'published', 'cancelled')
        );
      drop policy if exists "Hosts and admins can insert their own events" on public.events;
      create policy "Hosts and admins can insert their own events" on public.events
        for insert to authenticated
        with check (
          owner_id = (select auth.uid())
          and public.is_host_or_admin((select auth.uid()))
        );
      drop policy if exists "Members insert pending events" on public.events;
      create policy "Members insert pending events" on public.events
        for insert to authenticated
        with check (
          owner_id = (select auth.uid())
          and event_type = 'standard_event'
          and status = 'pending_approval'
        );
      drop policy if exists "Users can view visible events" on public.events;
      create policy "Users can view visible events" on public.events
        for select to authenticated
        using (
          status = any (array['published', 'cancelled'])
          or owner_id = (select auth.uid())
          or public.is_admin((select auth.uid()))
        );
      grant usage on schema auth to anon, authenticated, service_role;
      grant execute on function auth.uid() to anon, authenticated, service_role;
      grant select, insert, update on public.events to authenticated, service_role;
      grant usage on schema auth to service_role;
      grant delete on auth.users to service_role;
      grant select, delete on public.profiles to authenticated, service_role;
      grant select, insert, update, delete on public.event_additional_hosts to authenticated, service_role;
    `)

    const listingRepair = readFileSync(
      join(
        process.cwd(),
        'supabase/migrations/20261113050000_preserve_public_listing_on_maintenance.sql'
      ),
      'utf8'
    )
    expect(listingRepair).not.toMatch(/auth\.uid\(\)\s+is\s+null/i)
    expect(listingRepair).not.toContain('events_enforce_approval_gates')
    expect(listingRepair).not.toMatch(/revoke\s+select/i)
    expect(listingRepair).not.toMatch(/grant\s+select/i)
    expect(listingRepair).not.toMatch(
      /(?:select|perform)\s+public\.restore_proven_public_event_listings\s*\(/i
    )
    expect(listingRepair).toContain(
      'create or replace function public.restore_proven_public_event_listings()'
    )
    await db.query(listingRepair)
  })

  beforeEach(async () => {
    await resetSession()
  })

  afterAll(async () => {
    await resetSession()
    await db.end()
  })

  it('keeps an existing event attributed to its creator after the migration', async () => {
    const row = await db.query(
      `select owner_id, primary_host_id, status from public.events where id = $1`,
      [EXISTING]
    )
    expect(row.rows[0]).toMatchObject({
      owner_id: EXISTING,
      primary_host_id: EXISTING,
      status: 'published',
    })
  })

  it('lets an admin replace the primary host and keeps creator, status, and management owner', async () => {
    const created = await db.query(
      `insert into public.events (owner_id, title, status)
       values ($1, 'Pending social', 'pending_approval')
       returning id`,
      [CREATOR]
    )
    const eventId = created.rows[0].id as string

    await asUser(ADMIN)
    await db.query(
      `update public.events set primary_host_id = $2 where id = $1`,
      [eventId, HOST]
    )
    await resetSession()

    const saved = await db.query(
      `select owner_id, primary_host_id, status, title from public.events where id = $1`,
      [eventId]
    )
    expect(saved.rows[0]).toMatchObject({
      owner_id: CREATOR,
      primary_host_id: HOST,
      status: 'pending_approval',
      title: 'Pending social',
    })
  })

  it('adds and removes additional hosts and reloads them in order', async () => {
    const created = await db.query(
      `insert into public.events (owner_id, title, status, primary_host_id)
       values ($1, 'Hosted night', 'pending_approval', $1)
       returning id`,
      [CREATOR]
    )
    const eventId = created.rows[0].id as string

    await asUser(ADMIN)
    await db.query(
      `insert into public.event_additional_hosts (event_id, profile_id, sort_order)
       values ($1, $2, 0), ($1, $3, 1)`,
      [eventId, HOST, COHOST]
    )
    await db.query(
      `delete from public.event_additional_hosts
       where event_id = $1 and profile_id = $2`,
      [eventId, HOST]
    )
    await resetSession()

    const hosts = await db.query(
      `select profile_id from public.event_additional_hosts
       where event_id = $1 order by sort_order`,
      [eventId]
    )
    expect(hosts.rows.map((row) => row.profile_id)).toEqual([COHOST])

    const event = await db.query(
      `select owner_id, primary_host_id, status from public.events where id = $1`,
      [eventId]
    )
    expect(event.rows[0]).toMatchObject({
      owner_id: CREATOR,
      primary_host_id: CREATOR,
      status: 'pending_approval',
    })
  })

  it('rejects duplicate, primary-overlap, and ineligible host assignments', async () => {
    const created = await db.query(
      `insert into public.events (owner_id, title, status, primary_host_id)
       values ($1, 'Guarded', 'pending_approval', $2)
       returning id`,
      [CREATOR, HOST]
    )
    const eventId = created.rows[0].id as string
    await asUser(ADMIN)

    await expect(
      db.query(`update public.events set primary_host_id = $2 where id = $1`, [
        eventId,
        MEMBER,
      ])
    ).rejects.toThrow(/hosting abilities/i)

    await expect(
      db.query(`update public.events set primary_host_id = $2 where id = $1`, [
        eventId,
        REMOVED,
      ])
    ).rejects.toThrow(/hosting abilities/i)

    await expect(
      db.query(
        `insert into public.event_additional_hosts (event_id, profile_id, sort_order)
         values ($1, $2, 0)`,
        [eventId, HOST]
      )
    ).rejects.toThrow(/already the primary host/i)

    await expect(
      db.query(
        `insert into public.event_additional_hosts (event_id, profile_id, sort_order)
         values ($1, $2, 0)`,
        [eventId, MEMBER]
      )
    ).rejects.toThrow(/hosting abilities/i)

    await db.query(
      `insert into public.event_additional_hosts (event_id, profile_id, sort_order)
       values ($1, $2, 0)`,
      [eventId, COHOST]
    )
    await expect(
      db.query(
        `insert into public.event_additional_hosts (event_id, profile_id, sort_order)
         values ($1, $2, 1)`,
        [eventId, COHOST]
      )
    ).rejects.toThrow(/duplicate key/i)

    await resetSession()
    const event = await db.query(
      `select primary_host_id, status from public.events where id = $1`,
      [eventId]
    )
    expect(event.rows[0]).toMatchObject({
      primary_host_id: HOST,
      status: 'pending_approval',
    })
  })

  it('rejects primary and additional host changes from the creator, a host, and a member', async () => {
    const created = await db.query(
      `insert into public.events (owner_id, title, status, primary_host_id)
       values ($1, 'Owned by member', 'pending_approval', $1)
       returning id`,
      [CREATOR]
    )
    const eventId = created.rows[0].id as string

    await asUser(CREATOR)
    await expect(
      db.query(`update public.events set primary_host_id = $2 where id = $1`, [
        eventId,
        HOST,
      ])
    ).rejects.toThrow(/only admins can change the primary host/i)
    await expect(
      db.query(
        `insert into public.event_additional_hosts (event_id, profile_id, sort_order)
         values ($1, $2, 0)`,
        [eventId, COHOST]
      )
    ).rejects.toThrow(/only admins can assign additional hosts|row-level security/i)

    await asUser(HOST)
    const hostUpdate = await db.query(
      `update public.events set primary_host_id = $2 where id = $1`,
      [eventId, HOST]
    )
    expect(hostUpdate.rowCount).toBe(0)

    await asUser(MEMBER)
    const memberUpdate = await db.query(
      `update public.events set title = 'taken over' where id = $1`,
      [eventId]
    )
    expect(memberUpdate.rowCount).toBe(0)

    await resetSession()
    const event = await db.query(
      `select owner_id, primary_host_id, title, status from public.events where id = $1`,
      [eventId]
    )
    expect(event.rows[0]).toMatchObject({
      owner_id: CREATOR,
      primary_host_id: CREATOR,
      title: 'Owned by member',
      status: 'pending_approval',
    })
  })

  it('still requires member-created events to stay pending and blocks self-publish', async () => {
    await asUser(CREATOR)
    await expect(
      db.query(
        `insert into public.events (owner_id, title, status, event_type)
         values ($1, 'Published by member', 'published', 'standard_event')`,
        [CREATOR]
      )
    ).rejects.toThrow(/pending_approval|row-level security/i)

    const created = await db.query(
      `insert into public.events (owner_id, title, status)
       values ($1, 'Needs approval', 'pending_approval')
       returning id, primary_host_id`,
      [CREATOR]
    )
    expect(created.rows[0].primary_host_id).toBe(CREATOR)
    await expect(
      db.query(`update public.events set status = 'published' where id = $1`, [
        created.rows[0].id,
      ])
    ).rejects.toThrow(/only admins can publish/i)
    await resetSession()
  })

  it('does not let a named host publish or edit an event they do not own', async () => {
    const created = await db.query(
      `insert into public.events (owner_id, title, status, primary_host_id)
       values ($1, 'Named host', 'pending_approval', $2)
       returning id`,
      [ADMIN, HOST]
    )
    await asUser(ADMIN)
    await db.query(
      `insert into public.event_additional_hosts (event_id, profile_id, sort_order)
       values ($1, $2, 0)`,
      [created.rows[0].id, COHOST]
    )
    await asUser(HOST)
    const primaryEdit = await db.query(
      `update public.events set status = 'published' where id = $1`,
      [created.rows[0].id]
    )
    expect(primaryEdit.rowCount).toBe(0)
    await asUser(COHOST)
    const cohostEdit = await db.query(
      `update public.events set title = 'co-host edit' where id = $1`,
      [created.rows[0].id]
    )
    expect(cohostEdit.rowCount).toBe(0)
    await resetSession()
    const event = await db.query(
      `select owner_id, primary_host_id, status, title from public.events where id = $1`,
      [created.rows[0].id]
    )
    expect(event.rows[0]).toMatchObject({
      owner_id: ADMIN,
      primary_host_id: HOST,
      status: 'pending_approval',
      title: 'Named host',
    })
  })

  it('removes a deleted additional host and falls back when the primary host is deleted', async () => {
    const extraHost = '88888888-8888-4888-8888-888888888888'
    const extraCoHost = '99999999-9999-4999-8999-999999999999'
    await db.query(`insert into auth.users (id) values ($1), ($2)`, [
      extraHost,
      extraCoHost,
    ])
    await db.query(
      `insert into public.profiles (id, full_name, role) values
       ($1, 'Temp Host', 'host'), ($2, 'Temp CoHost', 'host')`,
      [extraHost, extraCoHost]
    )
    const created = await db.query(
      `insert into public.events (owner_id, title, status, primary_host_id)
       values ($1, 'Release hosts', 'pending_approval', $2)
       returning id`,
      [CREATOR, extraHost]
    )
    const eventId = created.rows[0].id as string
    await asUser(ADMIN)
    await db.query(
      `insert into public.event_additional_hosts (event_id, profile_id, sort_order)
       values ($1, $2, 0)`,
      [eventId, extraCoHost]
    )
    await resetSession()
    await db.query(`delete from auth.users where id = $1`, [extraCoHost])
    await resetSession()
    const afterCoHost = await db.query(
      `select owner_id, primary_host_id,
        (select count(*) from public.event_additional_hosts where event_id = $1) as hosts
       from public.events where id = $1`,
      [eventId]
    )
    expect(afterCoHost.rows[0]).toMatchObject({
      owner_id: CREATOR,
      primary_host_id: extraHost,
      hosts: '0',
    })

    await resetSession()
    await db.query(`delete from auth.users where id = $1`, [extraHost])
    await resetSession()
    const afterPrimary = await db.query(
      `select owner_id, primary_host_id, status from public.events where id = $1`,
      [eventId]
    )
    expect(afterPrimary.rows[0]).toMatchObject({
      owner_id: CREATOR,
      primary_host_id: null,
      status: 'pending_approval',
    })
  })

  it('still deletes an event when its creator is deleted', async () => {
    const doomed = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    await db.query(`insert into auth.users (id) values ($1)`, [doomed])
    await db.query(
      `insert into public.profiles (id, full_name, role) values ($1, 'Doomed', 'member')`,
      [doomed]
    )
    const created = await db.query(
      `insert into public.events (owner_id, title, status) values ($1, 'Goes away', 'pending_approval')
       returning id`,
      [doomed]
    )
    await resetSession()
    await db.query(`delete from auth.users where id = $1`, [doomed])
    await resetSession()
    const remaining = await db.query(`select id from public.events where id = $1`, [
      created.rows[0].id,
    ])
    expect(remaining.rowCount).toBe(0)
  })

  it('documents the existing bypass: a non-admin host can publish without admin approval', async () => {
    await asUser(HOST)
    const published = await db.query(
      `insert into public.events (owner_id, title, status, event_type)
       values ($1, 'Host published directly', 'published', 'standard_event')
       returning id, owner_id, status, primary_host_id`,
      [HOST]
    )
    expect(published.rows[0]).toMatchObject({
      owner_id: HOST,
      status: 'published',
      primary_host_id: HOST,
    })

    const pending = await db.query(
      `insert into public.events (owner_id, title, status)
       values ($1, 'Host publishes later', 'pending_approval')
       returning id`,
      [HOST]
    )
    await db.query(`update public.events set status = 'published' where id = $1`, [
      pending.rows[0].id,
    ])

    await asUser(MEMBER)
    const visible = await db.query(
      `select id, status from public.events where id in ($1, $2)`,
      [published.rows[0].id, pending.rows[0].id]
    )
    expect(visible.rows).toEqual(
      expect.arrayContaining([
        { id: published.rows[0].id, status: 'published' },
        { id: pending.rows[0].id, status: 'published' },
      ])
    )
    expect(visible.rowCount).toBe(2)

    await asUser(HOST)
    const someoneElse = await db.query(
      `update public.events set status = 'published' where owner_id = $1 and status = 'pending_approval'`,
      [CREATOR]
    )
    expect(someoneElse.rowCount).toBe(0)
    await resetSession()
  })

  it('saves primary and additional hosts atomically, in order, and rejects forged writes', async () => {
    const created = await db.query(
      `insert into public.events (owner_id, title, status, primary_host_id)
       values ($1, 'Atomic hosts', 'pending_approval', $2)
       returning id`,
      [CREATOR, HOST]
    )
    const eventId = created.rows[0].id as string
    await asUser(ADMIN)
    await db.query(
      `select public.assign_event_hosts($1, $2, array[$3, $4]::uuid[])`,
      [eventId, HOST, COHOST, ADMIN]
    )
    const ordered = await db.query(
      `select profile_id from public.event_additional_hosts
       where event_id = $1 order by sort_order`,
      [eventId]
    )
    expect(ordered.rows.map((row) => row.profile_id)).toEqual([COHOST, ADMIN])

    await db.query(
      `select public.assign_event_hosts($1, $2, array[$3, $4]::uuid[])`,
      [eventId, HOST, ADMIN, COHOST]
    )
    const reordered = await db.query(
      `select profile_id from public.event_additional_hosts
       where event_id = $1 order by sort_order`,
      [eventId]
    )
    expect(reordered.rows.map((row) => row.profile_id)).toEqual([ADMIN, COHOST])

    await expect(
      db.query(
        `select public.assign_event_hosts($1, $2, array[$3]::uuid[])`,
        [eventId, COHOST, MEMBER]
      )
    ).rejects.toThrow(/hosting abilities/i)

    const unchanged = await db.query(
      `select primary_host_id,
        (select array_agg(profile_id order by sort_order)
         from public.event_additional_hosts where event_id = events.id) as hosts
       from public.events where id = $1`,
      [eventId]
    )
    expect(unchanged.rows[0].primary_host_id).toBe(HOST)
    expect(unchanged.rows[0].hosts).toEqual([ADMIN, COHOST])

    await resetSession()
    const ownedByHost = await db.query(
      `insert into public.events (owner_id, title, status)
       values ($1, 'Host owned', 'pending_approval')
       returning id`,
      [HOST]
    )
    await asUser(HOST)
    await expect(
      db.query(`update public.events set primary_host_id = $2 where id = $1`, [
        ownedByHost.rows[0].id,
        COHOST,
      ])
    ).rejects.toThrow(/only admins can change the primary host/i)

    await resetSession()
    await db.query('alter role service_role bypassrls')
    try {
      await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [HOST])
      await db.query('set role service_role')
      await expect(
        db.query(`update public.events set primary_host_id = $2 where id = $1`, [
          eventId,
          COHOST,
        ])
      ).rejects.toThrow(/only admins can change the primary host/i)
      await expect(
        db.query(
          `insert into public.event_additional_hosts (event_id, profile_id, sort_order)
           values ($1, $2, 9)`,
          [eventId, MEMBER]
        )
      ).rejects.toThrow(/only admins can assign additional hosts/i)
      await expect(
        db.query(`select public.assign_event_hosts($1, $2, array[]::uuid[])`, [
          eventId,
          COHOST,
        ])
      ).rejects.toThrow(/permission denied/i)
    } finally {
      await resetSession()
      await db.query('alter role service_role nobypassrls')
    }

    const afterForge = await db.query(
      `select owner_id, primary_host_id, status from public.events where id = $1`,
      [eventId]
    )
    expect(afterForge.rows[0]).toMatchObject({
      owner_id: CREATOR,
      primary_host_id: HOST,
      status: 'pending_approval',
    })
  })

  it('does not let the profile-deletion marker authorize a direct primary-host change', async () => {
    const created = await db.query(
      `insert into public.events (owner_id, title, status, primary_host_id)
       values ($1, 'Deletion flag', 'pending_approval', $1)
       returning id`,
      [HOST]
    )
    const eventId = created.rows[0].id as string

    async function expectFlaggedWriteRejected(pattern: RegExp, primaryHostId: string | null) {
      await db.query('begin')
      try {
        await db.query(
          `select set_config('hsc.releasing_deleted_profile_host', '1', true)`
        )
        await expect(
          db.query(`update public.events set primary_host_id = $2 where id = $1`, [
            eventId,
            primaryHostId,
          ])
        ).rejects.toThrow(pattern)
      } finally {
        await db.query('rollback')
      }
    }

    await asUser(HOST)
    await expectFlaggedWriteRejected(/only admins can change the primary host/i, COHOST)
    await expectFlaggedWriteRejected(/only admins can change the primary host/i, null)

    await resetSession()
    await db.query('alter role service_role bypassrls')
    try {
      await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [HOST])
      await db.query('set role service_role')
      await expectFlaggedWriteRejected(/only admins can change the primary host/i, COHOST)
      await expectFlaggedWriteRejected(/only admins can change the primary host/i, null)
    } finally {
      await resetSession()
      await db.query('alter role service_role nobypassrls')
    }

    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [ADMIN])
    await expectFlaggedWriteRejected(/hosting abilities/i, null)
    await resetSession()

    const unchanged = await db.query(
      `select owner_id, primary_host_id, status from public.events where id = $1`,
      [eventId]
    )
    expect(unchanged.rows[0]).toMatchObject({
      owner_id: HOST,
      primary_host_id: HOST,
      status: 'pending_approval',
    })
  })

  it('keeps display and eligibility aligned across host lifecycle changes', async () => {
    const primary = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    const extra = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    const keep = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    await db.query(`insert into auth.users (id) values ($1), ($2), ($3)`, [
      primary,
      extra,
      keep,
    ])
    await db.query(
      `insert into public.profiles (id, full_name, role) values
       ($1, 'Lifecycle Primary', 'host'),
       ($2, 'Lifecycle Extra', 'host'),
       ($3, 'Lifecycle Keep', 'host')`,
      [primary, extra, keep]
    )
    const created = await db.query(
      `insert into public.events (owner_id, title, status)
       values ($1, 'Lifecycle', 'pending_approval')
       returning id`,
      [CREATOR]
    )
    const eventId = created.rows[0].id as string
    await asUser(ADMIN)
    await db.query(
      `select public.assign_event_hosts($1, $2, array[$3, $4]::uuid[])`,
      [eventId, primary, extra, keep]
    )

    async function snapshot() {
      const event = await db.query(
        `select owner_id, primary_host_id, status, title from public.events where id = $1`,
        [eventId]
      )
      const hosts = await db.query(
        `select profile_id from public.event_additional_hosts
         where event_id = $1 order by sort_order`,
        [eventId]
      )
      return {
        ...event.rows[0],
        additional: hosts.rows.map((row) => row.profile_id),
      }
    }

    async function editTitle(title: string) {
      await asUser(ADMIN)
      await db.query(`update public.events set title = $2 where id = $1`, [
        eventId,
        title,
      ])
      await resetSession()
    }

    await editTitle('After assignment')
    expect(await snapshot()).toMatchObject({
      owner_id: CREATOR,
      primary_host_id: primary,
      status: 'pending_approval',
      title: 'After assignment',
      additional: [extra, keep],
    })

    await resetSession()
    await db.query(`delete from auth.users where id = $1`, [extra])
    await editTitle('After additional host deleted')
    expect(await snapshot()).toMatchObject({
      owner_id: CREATOR,
      primary_host_id: primary,
      status: 'pending_approval',
      title: 'After additional host deleted',
      additional: [keep],
    })

    await db.query(`update public.profiles set role = 'member' where id = $1`, [keep])
    await editTitle('After host role removed')
    await asUser(ADMIN)
    await db.query(
      `select public.assign_event_hosts($1, $2, array[$3]::uuid[])`,
      [eventId, primary, keep]
    )
    await resetSession()
    const other = await db.query(
      `insert into public.events (owner_id, title, status)
       values ($1, 'New assignment', 'pending_approval') returning id`,
      [CREATOR]
    )
    await asUser(ADMIN)
    await expect(
      db.query(`select public.assign_event_hosts($1, $2, array[]::uuid[])`, [
        other.rows[0].id,
        keep,
      ])
    ).rejects.toThrow(/hosting abilities/i)
    await resetSession()
    expect(await snapshot()).toMatchObject({
      owner_id: CREATOR,
      primary_host_id: primary,
      status: 'pending_approval',
      title: 'After host role removed',
      additional: [keep],
    })

    await db.query(`update public.profiles set removed_at = now() where id = $1`, [keep])
    await editTitle('After host marked removed')
    await asUser(ADMIN)
    await db.query(
      `select public.assign_event_hosts($1, $2, array[$3]::uuid[])`,
      [eventId, primary, keep]
    )
    await expect(
      db.query(
        `insert into public.event_additional_hosts (event_id, profile_id, sort_order)
         values ($1, $2, 0)`,
        [other.rows[0].id, keep]
      )
    ).rejects.toThrow(/hosting abilities/i)
    await resetSession()
    expect(await snapshot()).toMatchObject({
      primary_host_id: primary,
      owner_id: CREATOR,
      status: 'pending_approval',
      title: 'After host marked removed',
      additional: [keep],
    })

    // The table owner bypasses row security, but the session still has an
    // admin identity. Clearing the primary host must succeed in that case.
    await resetSession()
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [ADMIN])
    const removedProfile = await db.query(`delete from public.profiles where id = $1`, [
      primary,
    ])
    expect(removedProfile.rowCount).toBe(1)
    await resetSession()
    await editTitle('After primary host deleted')
    expect(await snapshot()).toMatchObject({
      owner_id: CREATOR,
      primary_host_id: null,
      status: 'pending_approval',
      title: 'After primary host deleted',
      additional: [keep],
    })
    expect(
      await db.query(`select id from public.profiles where id = $1`, [primary])
    ).toMatchObject({ rowCount: 0 })

    await asUser(ADMIN)
    await expect(
      db.query(`update public.events set primary_host_id = $2 where id = $1`, [
        eventId,
        CREATOR,
      ])
    ).rejects.toThrow(/hosting abilities/i)
    await expect(
      db.query(
        `select public.assign_event_hosts($1, $2, array[$3]::uuid[])`,
        [eventId, CREATOR, keep]
      )
    ).rejects.toThrow(/hosting abilities/i)
    await db.query(
      `select public.assign_event_hosts($1, null, array[$2]::uuid[])`,
      [eventId, keep]
    )
    await resetSession()
    expect(await snapshot()).toMatchObject({
      owner_id: CREATOR,
      primary_host_id: null,
      status: 'pending_approval',
      additional: [keep],
    })
  })

  it('rolls back event fields and host assignments together', async () => {
    const created = await db.query(
      `insert into public.events (owner_id, title, status, primary_host_id)
       values ($1, 'Original title', 'pending_approval', $2)
       returning id`,
      [CREATOR, HOST]
    )
    const eventId = created.rows[0].id as string
    await asUser(ADMIN)
    await db.query(
      `select public.assign_event_hosts($1, $2, array[$3]::uuid[])`,
      [eventId, HOST, COHOST]
    )

    async function savedState() {
      const event = await db.query(
        `select title, owner_id, primary_host_id, status from public.events where id = $1`,
        [eventId]
      )
      const hosts = await db.query(
        `select profile_id from public.event_additional_hosts
         where event_id = $1 order by sort_order`,
        [eventId]
      )
      return {
        ...event.rows[0],
        additional: hosts.rows.map((row) => row.profile_id),
      }
    }

    const before = await savedState()

    await expect(
      db.query(
        `select public.update_event_with_hosts(
           target_event_id => $1,
           title => null,
           location => 'Hall',
           starts_at => now(),
           description => null,
           ends_at => null,
           attendance_max => null,
           cover_image_url => null,
           apply_cover_image => false,
           rsvp_question => null,
           rsvp_question_required => false,
           listed_publicly => false,
           event_type => 'standard_event',
           status => 'pending_approval',
           sponsorship_eligible => false,
           fee_cents => null,
           priority_rsvp_opens_at => null,
           general_rsvp_opens_at => null,
           next_primary_host_id => $2,
           next_additional_host_ids => array[$3]::uuid[]
         )`,
        [eventId, ADMIN, COHOST]
      )
    ).rejects.toThrow(/null value|not-null/i)
    expect(await savedState()).toEqual(before)

    await expect(
      db.query(
        `select public.update_event_with_hosts(
           target_event_id => $1,
           title => 'Renamed by failed hosts',
           location => 'Hall',
           starts_at => now(),
           description => null,
           ends_at => null,
           attendance_max => null,
           cover_image_url => null,
           apply_cover_image => false,
           rsvp_question => null,
           rsvp_question_required => false,
           listed_publicly => false,
           event_type => 'standard_event',
           status => 'pending_approval',
           sponsorship_eligible => false,
           fee_cents => null,
           priority_rsvp_opens_at => null,
           general_rsvp_opens_at => null,
           next_primary_host_id => $2,
           next_additional_host_ids => array[$3]::uuid[]
         )`,
        [eventId, HOST, MEMBER]
      )
    ).rejects.toThrow(/hosting abilities/i)
    expect(await savedState()).toEqual(before)

    const beforeCount = await db.query(`select count(*)::int as count from public.events`)
    await expect(
      db.query(
        `select public.create_event_with_hosts(
           title => 'Should not exist',
           location => 'Hall',
           starts_at => now(),
           description => null,
           ends_at => null,
           event_type => 'standard_event',
           status => 'pending_approval',
           sponsorship_eligible => false,
           attendance_max => null,
           cover_image_url => null,
           rsvp_question => null,
           rsvp_question_required => false,
           listed_publicly => false,
           fee_cents => null,
           priority_rsvp_opens_at => null,
           general_rsvp_opens_at => null,
           next_primary_host_id => $1,
           next_additional_host_ids => array[$2]::uuid[]
         )`,
        [HOST, MEMBER]
      )
    ).rejects.toThrow(/hosting abilities/i)
    const afterCount = await db.query(`select count(*)::int as count from public.events`)
    expect(afterCount.rows[0].count).toBe(beforeCount.rows[0].count)
    const leftover = await db.query(
      `select id from public.events where title = 'Should not exist'`
    )
    expect(leftover.rowCount).toBe(0)

    await asUser(MEMBER)
    await expect(
      db.query(
        `select public.update_event_with_hosts(
           target_event_id => $1,
           title => 'Forged title',
           location => 'Hall',
           starts_at => now(),
           description => null,
           ends_at => null,
           attendance_max => null,
           cover_image_url => null,
           apply_cover_image => false,
           rsvp_question => null,
           rsvp_question_required => false,
           listed_publicly => false,
           event_type => 'standard_event',
           status => 'published',
           sponsorship_eligible => false,
           fee_cents => null,
           priority_rsvp_opens_at => null,
           general_rsvp_opens_at => null,
           next_primary_host_id => $2,
           next_additional_host_ids => array[]::uuid[]
         )`,
        [eventId, MEMBER]
      )
    ).rejects.toThrow(/only admins can assign event hosts/i)
    await expect(
      db.query(
        `select public.create_event_with_hosts(
           title => 'Forged event',
           location => 'Hall',
           starts_at => now(),
           description => null,
           ends_at => null,
           event_type => 'standard_event',
           status => 'published',
           sponsorship_eligible => false,
           attendance_max => null,
           cover_image_url => null,
           rsvp_question => null,
           rsvp_question_required => false,
           listed_publicly => false,
           fee_cents => null,
           priority_rsvp_opens_at => null,
           general_rsvp_opens_at => null,
           next_primary_host_id => $1,
           next_additional_host_ids => array[]::uuid[]
         )`,
        [MEMBER]
      )
    ).rejects.toThrow(/only admins can assign event hosts/i)
    await resetSession()

    expect(await savedState()).toEqual(before)
    const forged = await db.query(
      `select id from public.events where title in ('Forged title', 'Forged event')`
    )
    expect(forged.rowCount).toBe(0)
  })

  it('preserves public and private flags through the host backfill', async () => {
    const publicEvent = '12121212-1212-4212-8212-121212121212'
    const privateEvent = '13131313-1313-4313-8313-131313131313'
    await resetSession()
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [ADMIN])
    await db.query(
      `insert into public.events (id, owner_id, title, status, listed_publicly, starts_at)
       values
         ($1, $3, 'Synthetic public', 'published', true, now() + interval '2 days'),
         ($2, $3, 'Synthetic private', 'published', false, now() + interval '3 days')`,
      [publicEvent, privateEvent, CREATOR]
    )
    await resetSession()
    await db.query(`alter table public.events disable trigger events_enforce_host_assignment`)
    await db.query(
      `update public.events set primary_host_id = null where id in ($1, $2)`,
      [publicEvent, privateEvent]
    )
    await db.query(`alter table public.events enable trigger events_enforce_host_assignment`)
    await db.query(
      `update public.events set primary_host_id = owner_id where primary_host_id is null`
    )

    const rows = await db.query(
      `select id, listed_publicly, status, owner_id, primary_host_id
       from public.events where id in ($1, $2) order by title`,
      [publicEvent, privateEvent]
    )
    expect(rows.rows).toEqual([
      {
        id: privateEvent,
        listed_publicly: false,
        status: 'published',
        owner_id: CREATOR,
        primary_host_id: CREATOR,
      },
      {
        id: publicEvent,
        listed_publicly: true,
        status: 'published',
        owner_id: CREATOR,
        primary_host_id: CREATOR,
      },
    ])
  })

  it('keeps ordinary members from enabling public listing', async () => {
    await asUser(MEMBER)
    const created = await db.query(
      `insert into public.events (owner_id, title, status, event_type, listed_publicly)
       values ($1, 'Member listing attempt', 'pending_approval', 'standard_event', true)
       returning id, listed_publicly`,
      [MEMBER]
    )
    expect(created.rows[0].listed_publicly).toBe(false)
    await db.query(`update public.events set listed_publicly = true where id = $1`, [
      created.rows[0].id,
    ])
    await db.query(`update public.events set title = 'Member edited title' where id = $1`, [
      created.rows[0].id,
    ])
    const after = await db.query(
      `select listed_publicly, title, status from public.events where id = $1`,
      [created.rows[0].id]
    )
    expect(after.rows[0]).toMatchObject({
      listed_publicly: false,
      title: 'Member edited title',
      status: 'pending_approval',
    })
  })

  it('keeps anonymous and service-role writes from enabling public listing', async () => {
    const target = '14141414-1414-4414-8414-141414141414'
    await resetSession()
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [ADMIN])
    await db.query(
      `insert into public.events (id, owner_id, title, status, listed_publicly)
       values ($1, $2, 'Untrusted target', 'published', false)`,
      [target, CREATOR]
    )
    await resetSession()

    await db.query(`grant select, update on public.events to anon`)
    await db.query(
      `grant execute on function public.event_host_release_owner_executing() to anon`
    )
    await db.query(`alter role anon bypassrls`)
    await db.query(`alter role service_role bypassrls`)
    try {
      for (const role of ['anon', 'service_role']) {
        await db.query('begin')
        try {
          await db.query(`set role ${role}`)
          await db.query(`select set_config('hsc.restoring_proven_public_listing', '1', true)`)
          await db.query(`update public.events set listed_publicly = true where id = $1`, [target])
          await db.query('reset role')
          const result = await db.query(
            `select listed_publicly from public.events where id = $1`,
            [target]
          )
          expect(result.rows[0].listed_publicly).toBe(false)
        } finally {
          await db.query('rollback')
        }
      }
    } finally {
      await resetSession()
      await db.query(`alter role anon nobypassrls`)
      await db.query(`alter role service_role nobypassrls`)
      await db.query(`revoke select, update on public.events from anon`)
      await db.query(
        `revoke execute on function public.event_host_release_owner_executing() from anon`
      )
    }
  })

  it('still lets a host or admin set public listing', async () => {
    await asUser(HOST)
    const created = await db.query(
      `insert into public.events (owner_id, title, status, listed_publicly)
       values ($1, 'Host lists later', 'pending_approval', false)
       returning id`,
      [HOST]
    )
    await db.query(`update public.events set listed_publicly = true where id = $1`, [
      created.rows[0].id,
    ])
    const listed = await db.query(
      `select listed_publicly from public.events where id = $1`,
      [created.rows[0].id]
    )
    expect(listed.rows[0].listed_publicly).toBe(true)
    await db.query(`update public.events set listed_publicly = false where id = $1`, [
      created.rows[0].id,
    ])
    const unlisted = await db.query(
      `select listed_publicly from public.events where id = $1`,
      [created.rows[0].id]
    )
    expect(unlisted.rows[0].listed_publicly).toBe(false)

    await asUser(ADMIN)
    await db.query(`update public.events set listed_publicly = true where id = $1`, [
      created.rows[0].id,
    ])
    const byAdmin = await db.query(
      `select listed_publicly, owner_id from public.events where id = $1`,
      [created.rows[0].id]
    )
    expect(byAdmin.rows[0]).toMatchObject({ listed_publicly: true, owner_id: HOST })
  })

  it('leaves event approval restrictions unchanged', async () => {
    await asUser(MEMBER)
    await expect(
      db.query(
        `insert into public.events (owner_id, title, status, event_type)
         values ($1, 'Member publishes directly', 'published', 'standard_event')`,
        [MEMBER]
      )
    ).rejects.toThrow(/pending_approval/i)
    const pending = await db.query(
      `insert into public.events (owner_id, title, status, event_type)
       values ($1, 'Member stays pending', 'pending_approval', 'standard_event')
       returning id`,
      [MEMBER]
    )
    await expect(
      db.query(`update public.events set status = 'published' where id = $1`, [
        pending.rows[0].id,
      ])
    ).rejects.toThrow(/only admins can publish/i)

    await asUser(HOST)
    const published = await db.query(
      `insert into public.events (owner_id, title, status, event_type)
       values ($1, 'Host still publishes own event', 'published', 'standard_event')
       returning status, owner_id`,
      [HOST]
    )
    expect(published.rows[0]).toMatchObject({ status: 'published', owner_id: HOST })
  })

  it('restores only the three cover-matched events', async () => {
    const commonGrounds = 'c5304898-0304-4f78-83f3-5cf388f94d2f'
    const beaverMoon = 'dd5606ef-25a9-4375-9c9b-71d2c9287fb4'
    const tableHop = '4ddc1132-0177-49e0-a7be-5ab27483e73d'
    const unrelated = '15151515-1515-4515-8515-151515151515'
    const startsAt = '2026-12-01T18:00:00Z'
    await resetSession()
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [ADMIN])
    await db.query(
      `insert into public.events (
         id, owner_id, title, status, listed_publicly, starts_at, ends_at,
         primary_host_id, cover_image_url
       ) values
         ($1, $5, 'Common Grounds at Charlie Foster''s', 'published', false, $6, null, $5,
          'https://example.test/event-images/8fc26522-fbca-45dd-8d33-be0a547de0c9.png'),
         ($2, $5, 'Beaver Moon Gratitude Gathering', 'published', false, $6, null, $5,
          'https://example.test/event-images/bb7b13a5-0ce4-4e60-939a-1fa1eea8266e.png'),
         ($3, $5, 'Table Hop Game Night at Lipz Lounge', 'published', false, $6, null, $5,
          'https://example.test/event-images/5dd06c47-e123-4b73-83b1-c2dfbaabae88.png'),
         ($4, $5, 'Unrelated private event', 'published', false, $6, null, $5,
          'https://example.test/event-images/not-a-homepage-cover.png')`,
      [commonGrounds, beaverMoon, tableHop, unrelated, CREATOR, startsAt]
    )
    await db.query(
      `insert into public.event_additional_hosts (event_id, profile_id, sort_order)
       values ($1, $2, 0)`,
      [commonGrounds, HOST]
    )
    await resetSession()

    await db.query('begin')
    await db.query(`select set_config('hsc.restoring_proven_public_listing', '1', true)`)
    await db.query(`update public.events set listed_publicly = true where id = $1`, [unrelated])
    await db.query(
      `update public.events set listed_publicly = true, title = 'Changed title' where id = $1`,
      [commonGrounds]
    )
    const blocked = await db.query(
      `select id, listed_publicly, title from public.events where id in ($1, $2) order by id`,
      [commonGrounds, unrelated]
    )
    expect(blocked.rows).toEqual([
      {
        id: unrelated,
        listed_publicly: false,
        title: 'Unrelated private event',
      },
      {
        id: commonGrounds,
        listed_publicly: false,
        title: 'Changed title',
      },
    ])
    await db.query('rollback')

    await asUser(ADMIN)
    await expect(
      db.query(`select public.restore_proven_public_event_listings()`)
    ).rejects.toThrow(/permission denied/i)
    await resetSession()

    const restored = await db.query(`select public.restore_proven_public_event_listings() as restored`)
    expect(restored.rows[0].restored).toBe(3)
    const again = await db.query(`select public.restore_proven_public_event_listings() as restored`)
    expect(again.rows[0].restored).toBe(0)

    const rows = await db.query(
      `select id, title, status, owner_id, primary_host_id, listed_publicly,
              starts_at, ends_at
       from public.events
       where id in ($1, $2, $3, $4)
       order by title`,
      [commonGrounds, beaverMoon, tableHop, unrelated]
    )
    expect(rows.rows.map((row) => ({ ...row, starts_at: row.starts_at.toISOString() }))).toEqual([
      {
        id: beaverMoon,
        title: 'Beaver Moon Gratitude Gathering',
        status: 'published',
        owner_id: CREATOR,
        primary_host_id: CREATOR,
        listed_publicly: true,
        starts_at: new Date(startsAt).toISOString(),
        ends_at: null,
      },
      {
        id: commonGrounds,
        title: "Common Grounds at Charlie Foster's",
        status: 'published',
        owner_id: CREATOR,
        primary_host_id: CREATOR,
        listed_publicly: true,
        starts_at: new Date(startsAt).toISOString(),
        ends_at: null,
      },
      {
        id: tableHop,
        title: 'Table Hop Game Night at Lipz Lounge',
        status: 'published',
        owner_id: CREATOR,
        primary_host_id: CREATOR,
        listed_publicly: true,
        starts_at: new Date(startsAt).toISOString(),
        ends_at: null,
      },
      {
        id: unrelated,
        title: 'Unrelated private event',
        status: 'published',
        owner_id: CREATOR,
        primary_host_id: CREATOR,
        listed_publicly: false,
        starts_at: new Date(startsAt).toISOString(),
        ends_at: null,
      },
    ])
    const hosts = await db.query(
      `select profile_id from public.event_additional_hosts where event_id = $1`,
      [commonGrounds]
    )
    expect(hosts.rows).toEqual([{ profile_id: HOST }])
  })
})
