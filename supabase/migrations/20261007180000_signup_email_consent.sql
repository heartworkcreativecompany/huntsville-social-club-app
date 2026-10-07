-- Signup email consent.
--
-- This migration records evidence and restricts who can change it. It does
-- not reject signups. The Before User Created hook function is created here
-- but is not enabled on hosted Auth by this migration. See
-- docs/signup-email-consent-rollout.md.
--
-- Existing profiles are not backfilled. New columns default to no consent.
--
-- Audit of security-definer profile writers in this repository:
-- handle_new_user inserts id, email, and role, then calls
-- record_signup_email_consent only when metadata contains JSON true.
-- No other security-definer function in supabase/migrations updates
-- public.profiles. Trigger functions guard_profile_application_status and
-- set_updated_at assign non-consent fields on NEW.
-- Consent changes are allowed only when current_user is consent_writer.
-- Unrelated security-definer functions stay owned by their existing owner, so
-- sharing that owner does not authorize them to change consent columns.

-- No BYPASSRLS. Hosted migrations run as postgres, which is not a
-- superuser, and only a superuser can create a BYPASSRLS role.
-- Policies below let this role write consent without bypassing RLS.
do $role$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'consent_writer') then
    create role consent_writer nologin;
  else
    alter role consent_writer nologin;
  end if;
end
$role$;

do $revoke_members$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
    revoke consent_writer from anon;
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    revoke consent_writer from authenticated;
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    revoke consent_writer from service_role;
  end if;
end
$revoke_members$;

grant usage, create on schema public to consent_writer;
grant usage on schema auth to consent_writer;

alter table public.profiles
  add column if not exists essential_email_acknowledged boolean not null default false,
  add column if not exists essential_email_acknowledged_at timestamptz,
  add column if not exists essential_email_acknowledgement_source text,
  add column if not exists essential_email_acknowledgement_version text,
  add column if not exists email_marketing_opt_in boolean not null default false,
  add column if not exists email_marketing_opt_in_at timestamptz,
  add column if not exists email_marketing_consent_source text,
  add column if not exists email_marketing_consent_version text,
  add column if not exists email_marketing_opted_out_at timestamptz;

comment on column public.profiles.essential_email_acknowledgement_source is
  'auth_signup means Auth user metadata contained JSON true at creation. It is not proof a checkbox was rendered.';

comment on column public.profiles.email_marketing_consent_source is
  'auth_signup means Auth user metadata contained JSON true at creation. It is not proof a checkbox was rendered.';

-- Column REVOKE does not override a table-level UPDATE grant.
-- Revoke table UPDATE, then grant authenticated only the non-consent columns.
-- service_role keeps table UPDATE; the guard trigger blocks its consent writes.
revoke update on table public.profiles from public, anon, authenticated;
grant update on table public.profiles to service_role;

do $column_grants$
declare
  cols text;
begin
  select string_agg(format('%I', column_name), ', ' order by ordinal_position)
    into cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'profiles'
    and column_name not in (
      'essential_email_acknowledged',
      'essential_email_acknowledged_at',
      'essential_email_acknowledgement_source',
      'essential_email_acknowledgement_version',
      'email_marketing_opt_in',
      'email_marketing_opt_in_at',
      'email_marketing_consent_source',
      'email_marketing_consent_version',
      'email_marketing_opted_out_at'
    );

  execute format(
    'grant update (%s) on table public.profiles to authenticated',
    cols
  );
end
$column_grants$;

grant update (
  essential_email_acknowledged,
  essential_email_acknowledged_at,
  essential_email_acknowledgement_source,
  essential_email_acknowledgement_version,
  email_marketing_opt_in,
  email_marketing_opt_in_at,
  email_marketing_consent_source,
  email_marketing_consent_version,
  email_marketing_opted_out_at
) on table public.profiles to consent_writer;

grant select on table public.profiles to consent_writer;

create table if not exists public.email_marketing_sync (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  action text not null,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz,
  last_error text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint email_marketing_sync_action_check
    check (action = any (array['enroll'::text, 'withdraw'::text])),
  constraint email_marketing_sync_status_check
    check (
      status = any (
        array[
          'pending'::text,
          'processing'::text,
          'synced'::text,
          'skipped'::text,
          'failed'::text
        ]
      )
    )
);

create index if not exists email_marketing_sync_pending_idx
  on public.email_marketing_sync (created_at)
  where status = 'pending';

create table if not exists public.resend_webhook_events (
  svix_id text primary key,
  event_type text not null,
  received_at timestamptz not null default pg_catalog.now()
);

alter table public.email_marketing_sync enable row level security;
alter table public.resend_webhook_events enable row level security;

revoke all on table public.email_marketing_sync from public, anon, authenticated;
revoke all on table public.resend_webhook_events from public, anon, authenticated;

grant select, insert, update, delete on table public.email_marketing_sync to service_role;
grant select, insert, update, delete on table public.resend_webhook_events to service_role;
grant select, insert, update on table public.email_marketing_sync to consent_writer;
grant select, insert on table public.resend_webhook_events to consent_writer;

drop policy if exists consent_writer_reads_profiles on public.profiles;
create policy consent_writer_reads_profiles
  on public.profiles
  for select
  to consent_writer
  using (true);

drop policy if exists consent_writer_updates_profiles on public.profiles;
create policy consent_writer_updates_profiles
  on public.profiles
  for update
  to consent_writer
  using (true)
  with check (true);

drop policy if exists consent_writer_manages_email_marketing_sync
  on public.email_marketing_sync;
create policy consent_writer_manages_email_marketing_sync
  on public.email_marketing_sync
  for all
  to consent_writer
  using (true)
  with check (true);

drop policy if exists consent_writer_inserts_resend_webhook_events
  on public.resend_webhook_events;
create policy consent_writer_inserts_resend_webhook_events
  on public.resend_webhook_events
  for insert
  to consent_writer
  with check (true);

create or replace function public.guard_profile_email_consent()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  consent_changed boolean;
begin
  if tg_op = 'INSERT' then
    consent_changed :=
      new.essential_email_acknowledged is true
      or new.essential_email_acknowledged_at is not null
      or new.essential_email_acknowledgement_source is not null
      or new.essential_email_acknowledgement_version is not null
      or new.email_marketing_opt_in is true
      or new.email_marketing_opt_in_at is not null
      or new.email_marketing_consent_source is not null
      or new.email_marketing_consent_version is not null
      or new.email_marketing_opted_out_at is not null;
  else
    consent_changed :=
      new.essential_email_acknowledged is distinct from old.essential_email_acknowledged
      or new.essential_email_acknowledged_at is distinct from old.essential_email_acknowledged_at
      or new.essential_email_acknowledgement_source is distinct from old.essential_email_acknowledgement_source
      or new.essential_email_acknowledgement_version is distinct from old.essential_email_acknowledgement_version
      or new.email_marketing_opt_in is distinct from old.email_marketing_opt_in
      or new.email_marketing_opt_in_at is distinct from old.email_marketing_opt_in_at
      or new.email_marketing_consent_source is distinct from old.email_marketing_consent_source
      or new.email_marketing_consent_version is distinct from old.email_marketing_consent_version
      or new.email_marketing_opted_out_at is distinct from old.email_marketing_opted_out_at;
  end if;

  if consent_changed and current_user is distinct from 'consent_writer' then
    raise exception 'email consent columns can only be changed by consent writer functions'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

drop trigger if exists profiles_guard_email_consent on public.profiles;
create trigger profiles_guard_email_consent
before insert or update on public.profiles
for each row
execute function public.guard_profile_email_consent();

create or replace function public.record_signup_email_consent(
  target_id uuid,
  essential_acknowledged boolean,
  marketing_opt_in boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if pg_catalog.pg_trigger_depth() < 1 then
    raise exception 'signup consent can only be recorded from account creation'
      using errcode = '42501';
  end if;

  if essential_acknowledged is true then
    update public.profiles
    set
      essential_email_acknowledged = true,
      essential_email_acknowledged_at = pg_catalog.now(),
      essential_email_acknowledgement_source = 'auth_signup',
      essential_email_acknowledgement_version = '2026-10-07-essential-email'
    where id = target_id;
  end if;

  if marketing_opt_in is true then
    update public.profiles
    set
      email_marketing_opt_in = true,
      email_marketing_opt_in_at = pg_catalog.now(),
      email_marketing_consent_source = 'auth_signup',
      email_marketing_consent_version = '2026-10-07-email-marketing',
      email_marketing_opted_out_at = null
    where id = target_id
      and email_marketing_opted_out_at is null;
  end if;
end;
$function$;

create or replace function public.apply_email_marketing_withdrawal(actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.profiles
  set
    email_marketing_opt_in = false,
    email_marketing_opted_out_at = coalesce(
      email_marketing_opted_out_at,
      pg_catalog.now()
    )
  where id = actor;

  update public.email_marketing_sync
  set
    status = 'skipped',
    last_error = 'local_withdrawal',
    updated_at = pg_catalog.now()
  where profile_id = actor
    and action = 'enroll'
    and status in ('pending', 'processing');

  insert into public.email_marketing_sync (profile_id, action, status)
  values (actor, 'withdraw', 'pending');
end;
$function$;

create or replace function public.withdraw_email_marketing()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor uuid;
begin
  actor := auth.uid();
  if actor is null or coalesce(auth.role(), '') is distinct from 'authenticated' then
    raise exception 'authentication required'
      using errcode = '42501';
  end if;

  perform public.apply_email_marketing_withdrawal(actor);
end;
$function$;

create or replace function public.apply_provider_marketing_unsubscribe(
  target_email text,
  provider_event_id text
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if target_email is null or provider_event_id is null or length(provider_event_id) = 0 then
    raise exception 'invalid unsubscribe request'
      using errcode = '22023';
  end if;

  -- The event id is recorded only in this same function transaction.
  -- A duplicate id returns before the profile update. Any later error,
  -- including a failed profile update, rolls the insert back so the
  -- provider can deliver the event again.
  begin
    insert into public.resend_webhook_events (svix_id, event_type)
    values (provider_event_id, 'contact.updated');
  exception
    when unique_violation then
      return 'duplicate';
  end;

  update public.profiles
  set
    email_marketing_opt_in = false,
    email_marketing_opted_out_at = coalesce(
      email_marketing_opted_out_at,
      pg_catalog.now()
    )
  where lower(email) = lower(target_email);

  return 'applied';
end;
$function$;

create or replace function public.apply_resend_contact_unsubscribe(
  target_email text,
  provider_event_id text
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'forbidden'
      using errcode = '42501';
  end if;

  return public.apply_provider_marketing_unsubscribe(target_email, provider_event_id);
end;
$function$;

create or replace function public.record_resend_webhook_delivery(
  provider_event_id text,
  provider_event_type text
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'forbidden'
      using errcode = '42501';
  end if;

  insert into public.resend_webhook_events (svix_id, event_type)
  values (provider_event_id, provider_event_type);

  return 'new';
exception
  when unique_violation then
    return 'duplicate';
end;
$function$;

create or replace function public.enqueue_email_marketing_enrollment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.email_marketing_sync (profile_id, action, status)
  select profile.id, 'enroll', 'pending'
  from public.profiles as profile
  where profile.id = new.id
    and profile.email_marketing_opt_in is true
    and profile.email_marketing_opted_out_at is null
    and not exists (
      select 1
      from public.email_marketing_sync as existing
      where existing.profile_id = profile.id
        and existing.action = 'enroll'
        and existing.status in ('pending', 'processing')
    );

  return new;
end;
$function$;

create or replace function public.recheck_email_marketing_sync(target_job_id uuid)
returns table (
  job_id uuid,
  profile_id uuid,
  action text,
  decision text,
  recipient_email text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  sync_row public.email_marketing_sync%rowtype;
  profile_row public.profiles%rowtype;
  confirmed_at timestamptz;
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'forbidden'
      using errcode = '42501';
  end if;

  select *
  into sync_row
  from public.email_marketing_sync
  where id = target_job_id;

  if not found then
    job_id := target_job_id;
    profile_id := null;
    action := null;
    decision := 'missing_job';
    recipient_email := null;
    return next;
    return;
  end if;

  select *
  into profile_row
  from public.profiles
  where id = sync_row.profile_id
  for update;

  select users.email_confirmed_at
  into confirmed_at
  from auth.users as users
  where users.id = sync_row.profile_id;

  job_id := sync_row.id;
  profile_id := sync_row.profile_id;
  action := sync_row.action;
  recipient_email := profile_row.email;

  if profile_row.email is null or length(btrim(profile_row.email)) = 0 then
    decision := 'skip_no_email';
  elsif sync_row.action = 'withdraw' then
    decision := 'send_unsubscribed_true';
  elsif profile_row.email_marketing_opted_out_at is not null then
    decision := 'skip_withdrawn';
  elsif profile_row.email_marketing_opt_in is not true then
    decision := 'skip_not_opted_in';
  elsif confirmed_at is null then
    decision := 'defer_unconfirmed';
  else
    decision := 'send_unsubscribed_false';
  end if;

  return next;
end;
$function$;

create or replace function public.claim_email_marketing_sync_jobs(limit_count integer)
returns table (
  id uuid,
  profile_id uuid,
  action text
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'forbidden'
      using errcode = '42501';
  end if;

  return query
  update public.email_marketing_sync as sync
  set
    status = 'processing',
    attempt_count = sync.attempt_count + 1,
    updated_at = pg_catalog.now()
  where sync.id in (
    select pending.id
    from public.email_marketing_sync as pending
    where pending.status = 'pending'
      and (
        pending.next_attempt_at is null
        or pending.next_attempt_at <= pg_catalog.now()
      )
    order by pending.created_at
    for update skip locked
    limit greatest(coalesce(limit_count, 1), 1)
  )
  returning sync.id, sync.profile_id, sync.action;
end;
$function$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  essential_acknowledged boolean;
  marketing_opt_in boolean;
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'member')
  on conflict (id) do nothing;

  if not found then
    return new;
  end if;

  essential_acknowledged :=
    coalesce(
      (new.raw_user_meta_data -> 'essential_email_acknowledgement') = 'true'::jsonb,
      false
    );
  marketing_opt_in :=
    coalesce(
      (new.raw_user_meta_data -> 'email_marketing_opt_in') = 'true'::jsonb,
      false
    );

  if essential_acknowledged or marketing_opt_in then
    perform public.record_signup_email_consent(
      new.id,
      essential_acknowledged,
      marketing_opt_in
    );
  end if;

  if marketing_opt_in and new.email_confirmed_at is not null then
    insert into public.email_marketing_sync (profile_id, action, status)
    select profile.id, 'enroll', 'pending'
    from public.profiles as profile
    where profile.id = new.id
      and profile.email_marketing_opt_in is true
      and profile.email_marketing_opted_out_at is null
      and not exists (
        select 1
        from public.email_marketing_sync as existing
        where existing.profile_id = profile.id
          and existing.action = 'enroll'
          and existing.status in ('pending', 'processing')
      );
  end if;

  return new;
end;
$function$;

create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  acknowledgement jsonb;
begin
  acknowledgement := event #> '{user,user_metadata,essential_email_acknowledgement}';
  if acknowledgement is distinct from 'true'::jsonb then
    return jsonb_build_object(
      'error',
      jsonb_build_object(
        'http_code', 400,
        'message', 'Essential email acknowledgement is required to create an account.'
      )
    );
  end if;

  return '{}'::jsonb;
end;
$function$;

grant consent_writer to postgres;
do $grant_owner$
begin
  if current_user is distinct from 'postgres' then
    execute format('grant consent_writer to %I', current_user);
  end if;
end
$grant_owner$;

alter function public.record_signup_email_consent(uuid, boolean, boolean)
  owner to consent_writer;
alter function public.apply_email_marketing_withdrawal(uuid)
  owner to consent_writer;
alter function public.apply_provider_marketing_unsubscribe(text, text)
  owner to consent_writer;

grant execute on function public.apply_email_marketing_withdrawal(uuid) to postgres;
grant execute on function public.apply_provider_marketing_unsubscribe(text, text) to postgres;
do $grant_inner$
begin
  if current_user is distinct from 'postgres' then
    execute format(
      'grant execute on function public.apply_email_marketing_withdrawal(uuid) to %I',
      current_user
    );
    execute format(
      'grant execute on function public.apply_provider_marketing_unsubscribe(text, text) to %I',
      current_user
    );
  end if;
end
$grant_inner$;

revoke all on function public.guard_profile_email_consent() from public;
grant execute on function public.guard_profile_email_consent()
  to anon, authenticated, service_role, consent_writer;
revoke all on function public.record_signup_email_consent(uuid, boolean, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.record_signup_email_consent(uuid, boolean, boolean)
  to postgres;
do $grant_record$
begin
  if current_user is distinct from 'postgres' then
    execute format(
      'grant execute on function public.record_signup_email_consent(uuid, boolean, boolean) to %I',
      current_user
    );
  end if;
end
$grant_record$;
revoke all on function public.apply_email_marketing_withdrawal(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.apply_provider_marketing_unsubscribe(text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.withdraw_email_marketing()
  from public, anon, service_role;
revoke all on function public.apply_resend_contact_unsubscribe(text, text)
  from public, anon, authenticated;
revoke all on function public.record_resend_webhook_delivery(text, text)
  from public, anon, authenticated;
revoke all on function public.enqueue_email_marketing_enrollment()
  from public, anon, authenticated, service_role;
revoke all on function public.recheck_email_marketing_sync(uuid)
  from public, anon, authenticated;
revoke all on function public.claim_email_marketing_sync_jobs(integer)
  from public, anon, authenticated;
revoke all on function public.hook_before_user_created(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.handle_new_user()
  from public, anon, authenticated;

grant execute on function public.withdraw_email_marketing() to authenticated;
grant execute on function public.apply_resend_contact_unsubscribe(text, text) to service_role;
grant execute on function public.record_resend_webhook_delivery(text, text) to service_role;
grant execute on function public.recheck_email_marketing_sync(uuid) to service_role;
grant execute on function public.claim_email_marketing_sync_jobs(integer) to service_role;

do $hook_grant$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
    grant execute on function public.handle_new_user() to supabase_auth_admin;
    grant execute on function public.enqueue_email_marketing_enrollment() to supabase_auth_admin;
    grant execute on function auth.uid() to consent_writer;
    grant execute on function auth.role() to consent_writer;
  end if;
end
$hook_grant$;

drop trigger if exists enqueue_email_marketing_on_confirm on auth.users;
create trigger enqueue_email_marketing_on_confirm
after update of email_confirmed_at on auth.users
for each row
when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
execute function public.enqueue_email_marketing_enrollment();
