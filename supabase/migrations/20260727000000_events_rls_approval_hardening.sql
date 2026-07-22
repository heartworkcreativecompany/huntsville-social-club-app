-- Harden events insert/update RLS for the member-created approval flow.
--
-- Verification notes:
-- - "Users can insert their own events" was already dropped in
--   20260525162330_remote_schema.sql and replaced by
--   "Hosts and admins can insert their own events".
-- - On a DB that applied migrations in order, that legacy insert policy is
--   NOT present, so it does not OR-bypass the paid-member insert policy.
-- - This migration still drops the legacy name defensively (drift / partial
--   restores) and closes the real approval bypass: owners can UPDATE a
--   pending_approval event to published via "Owners or admins can update events".

-- ---------------------------------------------------------------------------
-- Insert policies: defensive cleanup + reassert intended rules
-- ---------------------------------------------------------------------------

drop policy if exists "Users can insert their own events" on public.events;

-- Hosts/admins: any type/status for events they own.
drop policy if exists "Hosts and admins can insert their own events" on public.events;
create policy "Hosts and admins can insert their own events"
  on public.events
  as permissive
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.is_host_or_admin((select auth.uid()))
  );

-- Paid members: standard events only, pending admin approval.
drop policy if exists "Paid members can insert standard events pending approval"
  on public.events;
create policy "Paid members can insert standard events pending approval"
  on public.events
  as permissive
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and event_type = 'standard_event'
    and status = 'pending_approval'
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.application_status = 'approved'
        and coalesce(p.membership_billing->>'tier', '') in (
          'inner_circle',
          'elite_circle',
          'premium_member',
          'community_partner'
        )
    )
  );

-- ---------------------------------------------------------------------------
-- Update policies: owners must not self-publish / self-elevate event type
-- ---------------------------------------------------------------------------

-- Legacy policies that may still exist alongside the newer ones.
drop policy if exists "Users can update their own events" on public.events;
drop policy if exists "Owners or admins can update events" on public.events;

-- Admins: unrestricted updates (approve pending → published, etc.).
drop policy if exists "Admins can update any event" on public.events;
create policy "Admins can update any event"
  on public.events
  as permissive
  for update
  to authenticated
  using (public.is_admin((select auth.uid())))
  with check (public.is_admin((select auth.uid())));

-- Hosts: may fully manage events they own (including publish).
drop policy if exists "Hosts can update their own events" on public.events;
create policy "Hosts can update their own events"
  on public.events
  as permissive
  for update
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_host_or_admin((select auth.uid()))
  )
  with check (
    owner_id = (select auth.uid())
    and public.is_host_or_admin((select auth.uid()))
  );

-- Non-host members: may edit their own standard events, but cannot publish
-- or change event_type (enforced here + trigger below).
drop policy if exists "Members can update own non-published event details"
  on public.events;
drop policy if exists "Members can update own standard events"
  on public.events;
create policy "Members can update own standard events"
  on public.events
  as permissive
  for update
  to authenticated
  using (
    owner_id = (select auth.uid())
    and not public.is_host_or_admin((select auth.uid()))
  )
  with check (
    owner_id = (select auth.uid())
    and not public.is_host_or_admin((select auth.uid()))
    and event_type = 'standard_event'
    and status in ('draft', 'pending_approval', 'published', 'cancelled')
  );

-- Defense in depth: block self-publish / type elevation even if an insert/update
-- policy is misconfigured later.
create or replace function public.events_enforce_approval_gates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
  for each row
  execute function public.events_enforce_approval_gates();
