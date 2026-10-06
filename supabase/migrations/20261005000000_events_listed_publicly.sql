-- Opt-in public calendar listing.
-- Existing rows stay unlisted: the column is NOT NULL with default false,
-- and ADD COLUMN ... DEFAULT false does not rewrite or publish old events.
--
-- Anonymous reads use column privileges plus an anon-only RLS policy.
-- RLS filters rows. Column grants filter columns. A view is unnecessary:
-- PostgreSQL allows a policy to reference status and listed_publicly even
-- when anon has no SELECT on those columns.
-- Authenticated policies and grants are left unchanged.

alter table public.events
  add column if not exists listed_publicly boolean not null default false;

comment on column public.events.listed_publicly is
  'When true and status is published, anon may read a limited column set. Defaults to false so existing events stay off the public calendar.';

-- Table-level SELECT and any prior column-level SELECT are independent.
-- Clear both, then grant only the public columns.
revoke select on table public.events from anon;

revoke select (
  id,
  owner_id,
  title,
  description,
  location,
  starts_at,
  ends_at,
  visibility,
  status,
  event_type,
  fee_cents,
  sponsorship_eligible,
  priority_rsvp_opens_at,
  general_rsvp_opens_at,
  attendance_max,
  cover_image_url,
  rsvp_question,
  rsvp_question_required,
  created_at,
  updated_at,
  listed_publicly
) on table public.events from anon;

grant select (
  id,
  title,
  description,
  location,
  starts_at,
  ends_at,
  event_type,
  fee_cents,
  attendance_max,
  cover_image_url
) on table public.events to anon;

create policy "Anonymous users can read publicly listed published events"
  on public.events
  for select
  to anon
  using (
    status = 'published'
    and listed_publicly = true
  );

-- Members cannot list an event, including by writing the column directly.
-- Hosts and admins keep the value they set. Existing authenticated policies
-- are not dropped or replaced.
create or replace function public.events_enforce_public_listing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_host_or_admin(auth.uid()) then
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
grant execute on function public.events_enforce_public_listing() to authenticated, service_role;
