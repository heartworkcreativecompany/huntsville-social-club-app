-- Keep listed_publicly during a trusted maintenance update.
-- The host-assignment backfill updated every event with no JWT. The previous
-- listing trigger treated any non-host caller as untrusted and cleared the flag.
-- A null auth.uid() is not authorization. This replacement preserves the stored
-- flag only when the writer is the owner of public.events, is not anon,
-- authenticated, or service_role, and the update does not change the flag.
-- Hosts and admins still keep the value they set. Every other writer, including
-- a signed-in member and an anonymous or service-role session, still cannot
-- opt an event into the public calendar.
--
-- This migration does not update events, does not change approval, anon grants,
-- or host assignment, and does not call the restoration function.

create or replace function public.event_listing_maintenance_executing()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select current_user = (
           select pg_catalog.pg_get_userbyid(relowner)
           from pg_catalog.pg_class
           where oid = 'public.events'::regclass
         )
     and current_user not in ('anon', 'authenticated', 'service_role');
$$;

create or replace function public.event_listing_restore_executing()
returns boolean
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  restore_owner name;
begin
  if current_setting('hsc.restoring_proven_public_listing', true) is distinct from '1' then
    return false;
  end if;

  if current_user in ('anon', 'authenticated', 'service_role') then
    return false;
  end if;

  select pg_catalog.pg_get_userbyid(proowner)
    into restore_owner
  from pg_catalog.pg_proc
  where oid = 'public.restore_proven_public_event_listings()'::regprocedure;

  return current_user = restore_owner;
end;
$$;

create or replace function public.events_enforce_public_listing()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if public.is_host_or_admin(auth.uid()) then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.listed_publicly is not distinct from old.listed_publicly
     and public.event_listing_maintenance_executing() then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.listed_publicly is not true
     and new.listed_publicly is true
     and new.status = 'published'
     and old.status is not distinct from new.status
     and old.owner_id is not distinct from new.owner_id
     and old.starts_at is not distinct from new.starts_at
     and old.ends_at is not distinct from new.ends_at
     and old.primary_host_id is not distinct from new.primary_host_id
     and old.title is not distinct from new.title
     and old.cover_image_url is not distinct from new.cover_image_url
     and public.event_listing_restore_executing()
     and (
       (
         new.id = 'c5304898-0304-4f78-83f3-5cf388f94d2f'::uuid
         and new.cover_image_url like '%8fc26522-fbca-45dd-8d33-be0a547de0c9%'
       )
       or (
         new.id = 'dd5606ef-25a9-4375-9c9b-71d2c9287fb4'::uuid
         and new.cover_image_url like '%bb7b13a5-0ce4-4e60-939a-1fa1eea8266e%'
       )
       or (
         new.id = '4ddc1132-0177-49e0-a7be-5ab27483e73d'::uuid
         and new.cover_image_url like '%5dd06c47-e123-4b73-83b1-c2dfbaabae88%'
       )
     ) then
    return new;
  end if;

  new.listed_publicly := false;
  return new;
end;
$$;

drop trigger if exists events_enforce_public_listing on public.events;
create trigger events_enforce_public_listing
  before insert or update on public.events
  for each row
  execute function public.events_enforce_public_listing();

revoke all on function public.events_enforce_public_listing() from public;
grant execute on function public.events_enforce_public_listing() to anon, authenticated, service_role;

revoke all on function public.event_listing_maintenance_executing() from public;
grant execute on function public.event_listing_maintenance_executing() to anon, authenticated, service_role;

revoke all on function public.event_listing_restore_executing() from public;
grant execute on function public.event_listing_restore_executing() to anon, authenticated, service_role;

-- Explicit restoration for the three homepage covers. Not invoked here.
-- The statement assigns listed_publicly only. The existing set_events_updated_at
-- trigger also stamps updated_at. No other column is assigned.
create or replace function public.restore_proven_public_event_listings()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  restored integer;
begin
  perform set_config('hsc.restoring_proven_public_listing', '1', true);

  update public.events
  set listed_publicly = true
  where listed_publicly is false
    and status = 'published'
    and (
      (
        id = 'c5304898-0304-4f78-83f3-5cf388f94d2f'::uuid
        and cover_image_url like '%8fc26522-fbca-45dd-8d33-be0a547de0c9%'
      )
      or (
        id = 'dd5606ef-25a9-4375-9c9b-71d2c9287fb4'::uuid
        and cover_image_url like '%bb7b13a5-0ce4-4e60-939a-1fa1eea8266e%'
      )
      or (
        id = '4ddc1132-0177-49e0-a7be-5ab27483e73d'::uuid
        and cover_image_url like '%5dd06c47-e123-4b73-83b1-c2dfbaabae88%'
      )
    );

  get diagnostics restored = row_count;
  perform set_config('hsc.restoring_proven_public_listing', '', true);
  return restored;
exception
  when others then
    perform set_config('hsc.restoring_proven_public_listing', '', true);
    raise;
end;
$$;

revoke all on function public.restore_proven_public_event_listings() from public;
revoke all on function public.restore_proven_public_event_listings() from anon, authenticated, service_role;

comment on function public.restore_proven_public_event_listings() is
  'Sets listed_publicly for the three events proven public by pre-migration homepage covers. The existing set_events_updated_at trigger also stamps updated_at.';
