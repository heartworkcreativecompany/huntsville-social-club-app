-- Display hosts for an event, kept separate from the creator.
--
-- events.owner_id stays the creator and the only non-admin account that can
-- manage the event (edit, publish own events, attendee roster, RSVP answers,
-- guest registrations, and the host dashboard). Assigning a primary host or
-- an additional host does not change owner_id, approval, ticketing, pricing,
-- RSVP, refunds, or notifications, and it does not grant those management
-- rights to the named hosts.
--
-- Existing rows keep their current attribution: primary_host_id is backfilled
-- from owner_id. A null primary host (after the named member is deleted)
-- displays as the creator in the application.

alter table public.events
  add column if not exists primary_host_id uuid;

update public.events
set primary_host_id = owner_id
where primary_host_id is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'events_primary_host_id_fkey'
      and conrelid = 'public.events'::regclass
  ) then
    alter table public.events
      add constraint events_primary_host_id_fkey
      foreign key (primary_host_id) references public.profiles (id)
      on delete set null;
  end if;
end $$;

create index if not exists events_primary_host_id_idx
  on public.events (primary_host_id);

comment on column public.events.primary_host_id is
  'Profile shown as the primary host. Null displays as owner_id. Does not grant event management.';

create table if not exists public.event_additional_hosts (
  event_id uuid not null references public.events (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  sort_order integer not null check (sort_order >= 0),
  created_at timestamptz not null default now(),
  primary key (event_id, profile_id),
  unique (event_id, sort_order)
);

comment on table public.event_additional_hosts is
  'Display-only additional hosts. Does not grant edit, roster, RSVP-answer, publish, or notification rights.';

create index if not exists event_additional_hosts_profile_id_idx
  on public.event_additional_hosts (profile_id);

create or replace function public.is_hosting_enabled(check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
set row_security to off
as $$
  select coalesce(
    (
      select
        role = any (array['host'::text, 'admin'::text])
        and removed_at is null
      from public.profiles
      where id = check_user_id
      limit 1
    ),
    false
  );
$$;

comment on function public.is_hosting_enabled(uuid) is
  'True when the member currently has the Host or Admin role and has not been removed. Used only to validate host assignment.';

revoke all on function public.is_hosting_enabled(uuid) from public;
revoke all on function public.is_hosting_enabled(uuid) from anon;
grant execute on function public.is_hosting_enabled(uuid) to authenticated, service_role;

-- The profile-delete trigger sets hsc.releasing_deleted_profile_host around its
-- own clear. Any session can set that marker, so it is not authorization.
-- This is true only when the current statement is running as the owner of
-- events_release_deleted_profile_hosts. That function is security definer, so
-- the nested clear runs as its owner. An authenticated Host or service_role
-- stays itself and cannot pass.
create or replace function public.event_host_release_owner_executing()
returns boolean
language sql
stable
security invoker
set search_path to 'public'
as $$
  select current_setting('hsc.releasing_deleted_profile_host', true) = '1'
    and current_user is not distinct from (
      select pg_get_userbyid(p.proowner)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'events_release_deleted_profile_hosts'
      limit 1
    );
$$;

comment on function public.event_host_release_owner_executing() is
  'True when the deletion marker is set and the session is the profile-release function owner. Not sufficient by itself to change a primary host.';

revoke all on function public.event_host_release_owner_executing() from public;
revoke all on function public.event_host_release_owner_executing() from anon;
grant execute on function public.event_host_release_owner_executing() to authenticated, service_role;

create or replace function public.events_enforce_host_assignment()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $$
begin
  -- Clearing a primary host to null is the profile-deletion cleanup. It is
  -- allowed only for that nested statement: the marker is set, this update
  -- was issued from inside the profile-delete trigger, and the executor is
  -- that trigger function's owner. Setting the marker before a direct write
  -- does not authorize a Host, service_role, or any other primary change.
  if tg_op = 'UPDATE'
    and new.primary_host_id is null
    and old.primary_host_id is not null
    and pg_trigger_depth() > 1
    and public.event_host_release_owner_executing()
  then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.primary_host_id is null then
      new.primary_host_id := new.owner_id;
    end if;

    if new.primary_host_id is distinct from new.owner_id then
      if auth.uid() is null
        and current_user not in ('authenticated', 'anon', 'service_role') then
        return new;
      end if;
      if not public.is_admin(auth.uid()) then
        raise exception 'Only admins can assign a primary host other than the event creator';
      end if;
      if not public.is_hosting_enabled(new.primary_host_id) then
        raise exception 'Primary host must have hosting abilities';
      end if;
    end if;

    return new;
  end if;

  if new.primary_host_id is not distinct from old.primary_host_id then
    return new;
  end if;

  -- Profile deletion clears the column as the table owner. Authenticated
  -- members, anon, and service_role cannot use that path to skip the admin
  -- check. A null primary host displays as the creator; it is not a new
  -- assignment.
  if auth.uid() is null
    and current_user not in ('authenticated', 'anon', 'service_role') then
    return new;
  end if;

  if not public.is_admin(auth.uid()) then
    raise exception 'Only admins can change the primary host';
  end if;

  if new.primary_host_id is null
    or not public.is_hosting_enabled(new.primary_host_id) then
    raise exception 'Primary host must have hosting abilities';
  end if;

  return new;
end;
$$;

drop trigger if exists events_enforce_host_assignment on public.events;
create trigger events_enforce_host_assignment
  before insert or update on public.events
  for each row
  execute function public.events_enforce_host_assignment();

create or replace function public.events_drop_primary_from_additional_hosts()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $$
begin
  if new.primary_host_id is null then
    return null;
  end if;

  if tg_op = 'UPDATE'
    and new.primary_host_id is not distinct from old.primary_host_id then
    return null;
  end if;

  delete from public.event_additional_hosts
  where event_id = new.id
    and profile_id = new.primary_host_id;

  return null;
end;
$$;

drop trigger if exists events_drop_primary_from_additional_hosts on public.events;
create trigger events_drop_primary_from_additional_hosts
  after insert or update of primary_host_id on public.events
  for each row
  execute function public.events_drop_primary_from_additional_hosts();

create or replace function public.event_additional_hosts_enforce_assignment()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only admins can assign additional hosts';
  end if;

  if tg_op = 'UPDATE'
    and new.profile_id is not distinct from old.profile_id
    and new.event_id is not distinct from old.event_id then
    return new;
  end if;

  if exists (
    select 1
    from public.events
    where id = new.event_id
      and primary_host_id = new.profile_id
  ) then
    raise exception 'That member is already the primary host';
  end if;

  if not public.is_hosting_enabled(new.profile_id) then
    raise exception 'Additional hosts must have hosting abilities';
  end if;

  return new;
end;
$$;

drop trigger if exists event_additional_hosts_enforce_assignment
  on public.event_additional_hosts;
create trigger event_additional_hosts_enforce_assignment
  before insert or update on public.event_additional_hosts
  for each row
  execute function public.event_additional_hosts_enforce_assignment();

create or replace function public.events_release_deleted_profile_hosts()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Marker for the nested clear only. events_enforce_host_assignment also
  -- requires this function's owner, a nested trigger, and a null primary host.
  perform set_config('hsc.releasing_deleted_profile_host', '1', true);

  update public.events
  set primary_host_id = null
  where primary_host_id = old.id;

  delete from public.event_additional_hosts
  where profile_id = old.id;

  perform set_config('hsc.releasing_deleted_profile_host', '', true);
  return old;
end;
$$;

drop trigger if exists events_release_deleted_profile_hosts on public.profiles;
create trigger events_release_deleted_profile_hosts
  before delete on public.profiles
  for each row
  execute function public.events_release_deleted_profile_hosts();

alter table public.event_additional_hosts enable row level security;

drop policy if exists "Visible events expose additional hosts"
  on public.event_additional_hosts;
create policy "Visible events expose additional hosts"
  on public.event_additional_hosts
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.events
      where events.id = event_additional_hosts.event_id
        and (
          events.status = any (array['published'::text, 'cancelled'::text])
          or events.owner_id = (select auth.uid())
          or public.is_admin((select auth.uid()))
        )
    )
  );

drop policy if exists "Admins assign additional hosts"
  on public.event_additional_hosts;
create policy "Admins assign additional hosts"
  on public.event_additional_hosts
  for insert
  to authenticated
  with check (public.is_admin((select auth.uid())));

drop policy if exists "Admins update additional hosts"
  on public.event_additional_hosts;
create policy "Admins update additional hosts"
  on public.event_additional_hosts
  for update
  to authenticated
  using (public.is_admin((select auth.uid())))
  with check (public.is_admin((select auth.uid())));

drop policy if exists "Admins remove additional hosts"
  on public.event_additional_hosts;
create policy "Admins remove additional hosts"
  on public.event_additional_hosts
  for delete
  to authenticated
  using (public.is_admin((select auth.uid())));

revoke all on public.event_additional_hosts from public;
revoke all on public.event_additional_hosts from anon;
grant select, insert, update, delete on public.event_additional_hosts to authenticated;
grant select, insert, update, delete on public.event_additional_hosts to service_role;

-- Primary and additional hosts change in one function call. A failure rolls
-- both back. Existing additional hosts are updated in place, so a member who
-- later loses hosting abilities can stay on the event until an admin removes
-- them. Newly added hosts are checked. Sort order follows the supplied array.
create or replace function public.assign_event_hosts(
  target_event_id uuid,
  next_primary_host_id uuid,
  next_additional_host_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  current_primary uuid;
  desired uuid[] := array[]::uuid[];
  host_id uuid;
  position integer := 0;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only admins can assign event hosts';
  end if;

  if next_additional_host_ids is null then
    next_additional_host_ids := array[]::uuid[];
  end if;

  select primary_host_id
    into current_primary
  from public.events
  where id = target_event_id
  for update;

  if not found then
    raise exception 'Event not found';
  end if;

  foreach host_id in array next_additional_host_ids loop
    if host_id is null then
      raise exception 'Choose hosting-enabled members as additional hosts';
    end if;
    if host_id = next_primary_host_id then
      raise exception 'That member is already the primary host';
    end if;
    if host_id = any (desired) then
      raise exception 'Remove duplicate additional hosts before saving';
    end if;
    desired := desired || host_id;
  end loop;

  if cardinality(desired) > 20 then
    raise exception 'An event can have up to 20 additional hosts';
  end if;

  if next_primary_host_id is distinct from current_primary then
    if next_primary_host_id is null
      or not public.is_hosting_enabled(next_primary_host_id) then
      raise exception 'Primary host must have hosting abilities';
    end if;

    update public.events
    set primary_host_id = next_primary_host_id
    where id = target_event_id;
  end if;

  delete from public.event_additional_hosts
  where event_id = target_event_id
    and not (profile_id = any (desired));

  update public.event_additional_hosts
  set sort_order = sort_order + 1000
  where event_id = target_event_id;

  foreach host_id in array desired loop
    if exists (
      select 1
      from public.event_additional_hosts
      where event_id = target_event_id
        and profile_id = host_id
    ) then
      update public.event_additional_hosts
      set sort_order = position
      where event_id = target_event_id
        and profile_id = host_id;
    else
      if not public.is_hosting_enabled(host_id) then
        raise exception 'Additional hosts must have hosting abilities';
      end if;

      insert into public.event_additional_hosts (event_id, profile_id, sort_order)
      values (target_event_id, host_id, position);
    end if;
    position := position + 1;
  end loop;
end;
$$;

comment on function public.assign_event_hosts(uuid, uuid, uuid[]) is
  'Admin-only atomic replacement of the displayed primary host and additional hosts. Does not change owner_id or grant management access.';

-- Event fields and host assignment commit in one statement. These functions
-- are not a general editor: visibility is fixed to public, owner_id is never
-- accepted from the caller, and only an admin can run them. Row security and
-- the existing approval trigger still apply to the insert or update.
create or replace function public.create_event_with_hosts(
  title text,
  location text,
  starts_at timestamptz,
  description text,
  ends_at timestamptz,
  event_type text,
  status text,
  sponsorship_eligible boolean,
  attendance_max integer,
  cover_image_url text,
  rsvp_question text,
  rsvp_question_required boolean,
  listed_publicly boolean,
  fee_cents integer,
  priority_rsvp_opens_at timestamptz,
  general_rsvp_opens_at timestamptz,
  next_primary_host_id uuid,
  next_additional_host_ids uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  new_event_id uuid;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only admins can assign event hosts';
  end if;

  insert into public.events (
    owner_id,
    title,
    location,
    starts_at,
    description,
    ends_at,
    visibility,
    event_type,
    status,
    sponsorship_eligible,
    attendance_max,
    cover_image_url,
    rsvp_question,
    rsvp_question_required,
    listed_publicly,
    fee_cents,
    priority_rsvp_opens_at,
    general_rsvp_opens_at
  )
  values (
    auth.uid(),
    title,
    location,
    starts_at,
    description,
    ends_at,
    'public',
    event_type,
    status,
    sponsorship_eligible,
    attendance_max,
    cover_image_url,
    rsvp_question,
    rsvp_question_required,
    listed_publicly,
    fee_cents,
    priority_rsvp_opens_at,
    general_rsvp_opens_at
  )
  returning id into new_event_id;

  perform public.assign_event_hosts(
    new_event_id,
    next_primary_host_id,
    next_additional_host_ids
  );

  return new_event_id;
end;
$$;

create or replace function public.update_event_with_hosts(
  target_event_id uuid,
  title text,
  location text,
  starts_at timestamptz,
  description text,
  ends_at timestamptz,
  attendance_max integer,
  cover_image_url text,
  apply_cover_image boolean,
  rsvp_question text,
  rsvp_question_required boolean,
  listed_publicly boolean,
  event_type text,
  status text,
  sponsorship_eligible boolean,
  fee_cents integer,
  priority_rsvp_opens_at timestamptz,
  general_rsvp_opens_at timestamptz,
  next_primary_host_id uuid,
  next_additional_host_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path to 'public'
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only admins can assign event hosts';
  end if;

  perform public.assign_event_hosts(
    target_event_id,
    next_primary_host_id,
    next_additional_host_ids
  );

  update public.events
  set
    title = update_event_with_hosts.title,
    location = update_event_with_hosts.location,
    starts_at = update_event_with_hosts.starts_at,
    description = update_event_with_hosts.description,
    ends_at = update_event_with_hosts.ends_at,
    visibility = 'public',
    attendance_max = update_event_with_hosts.attendance_max,
    updated_at = now(),
    rsvp_question = update_event_with_hosts.rsvp_question,
    rsvp_question_required = update_event_with_hosts.rsvp_question_required,
    listed_publicly = update_event_with_hosts.listed_publicly,
    cover_image_url = case
      when update_event_with_hosts.apply_cover_image
        then update_event_with_hosts.cover_image_url
      else events.cover_image_url
    end,
    event_type = update_event_with_hosts.event_type,
    status = update_event_with_hosts.status,
    sponsorship_eligible = update_event_with_hosts.sponsorship_eligible,
    fee_cents = update_event_with_hosts.fee_cents,
    priority_rsvp_opens_at = update_event_with_hosts.priority_rsvp_opens_at,
    general_rsvp_opens_at = update_event_with_hosts.general_rsvp_opens_at
  where id = target_event_id;

  if not found then
    raise exception 'Event not found';
  end if;
end;
$$;

comment on function public.create_event_with_hosts(text, text, timestamptz, text, timestamptz, text, text, boolean, integer, text, text, boolean, boolean, integer, timestamptz, timestamptz, uuid, uuid[]) is
  'Admin create of one event and its host assignment. Both roll back together. Owner is auth.uid().';

comment on function public.update_event_with_hosts(uuid, text, text, timestamptz, text, timestamptz, integer, text, boolean, text, boolean, boolean, text, text, boolean, integer, timestamptz, timestamptz, uuid, uuid[]) is
  'Admin update of one event and its host assignment. A field or host failure leaves both unchanged. Does not change owner_id.';

revoke all on function public.assign_event_hosts(uuid, uuid, uuid[]) from public;
revoke all on function public.assign_event_hosts(uuid, uuid, uuid[]) from anon;
revoke all on function public.assign_event_hosts(uuid, uuid, uuid[]) from service_role;
grant execute on function public.assign_event_hosts(uuid, uuid, uuid[]) to authenticated;

revoke all on function public.create_event_with_hosts(text, text, timestamptz, text, timestamptz, text, text, boolean, integer, text, text, boolean, boolean, integer, timestamptz, timestamptz, uuid, uuid[]) from public;
revoke all on function public.create_event_with_hosts(text, text, timestamptz, text, timestamptz, text, text, boolean, integer, text, text, boolean, boolean, integer, timestamptz, timestamptz, uuid, uuid[]) from anon;
revoke all on function public.create_event_with_hosts(text, text, timestamptz, text, timestamptz, text, text, boolean, integer, text, text, boolean, boolean, integer, timestamptz, timestamptz, uuid, uuid[]) from service_role;
grant execute on function public.create_event_with_hosts(text, text, timestamptz, text, timestamptz, text, text, boolean, integer, text, text, boolean, boolean, integer, timestamptz, timestamptz, uuid, uuid[]) to authenticated;

revoke all on function public.update_event_with_hosts(uuid, text, text, timestamptz, text, timestamptz, integer, text, boolean, text, boolean, boolean, text, text, boolean, integer, timestamptz, timestamptz, uuid, uuid[]) from public;
revoke all on function public.update_event_with_hosts(uuid, text, text, timestamptz, text, timestamptz, integer, text, boolean, text, boolean, boolean, text, text, boolean, integer, timestamptz, timestamptz, uuid, uuid[]) from anon;
revoke all on function public.update_event_with_hosts(uuid, text, text, timestamptz, text, timestamptz, integer, text, boolean, text, boolean, boolean, text, text, boolean, integer, timestamptz, timestamptz, uuid, uuid[]) from service_role;
grant execute on function public.update_event_with_hosts(uuid, text, text, timestamptz, text, timestamptz, integer, text, boolean, text, boolean, boolean, text, text, boolean, integer, timestamptz, timestamptz, uuid, uuid[]) to authenticated;
