-- Optional attendance capacity + force public visibility for member-created events.

alter table public.events
  add column if not exists attendance_max integer
  check (attendance_max is null or attendance_max > 0);

alter table public.events
  alter column visibility set default 'public';

-- Paid-member inserts must be public (defense in depth with trigger below).
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
    and visibility = 'public'
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

-- Members cannot change visibility away from public on update.
drop policy if exists "Members can update own standard events" on public.events;
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
    and visibility = 'public'
    and status in ('draft', 'pending_approval', 'published', 'cancelled')
  );

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
    new.visibility := 'public';
    if new.event_type is distinct from 'standard_event' then
      raise exception 'Only hosts or admins can create non-standard events';
    end if;
    if new.status is distinct from 'pending_approval' then
      raise exception 'Member-created events must be submitted as pending_approval';
    end if;
  elsif tg_op = 'UPDATE' then
    new.visibility := 'public';
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
