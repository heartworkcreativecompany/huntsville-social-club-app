-- Fix infinite RLS recursion on public.profiles.
-- The "Users can update their own profile except role" policy queried
-- public.profiles inside its WITH CHECK, re-triggering profiles RLS.

create or replace function public.profile_role(check_user_id uuid)
returns text
language sql
stable
security definer
set search_path to 'public'
set row_security to off
as $$
  select role
  from public.profiles
  where id = check_user_id
  limit 1;
$$;

create or replace function public.is_admin(check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
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

create or replace function public.is_host_or_admin(check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
set row_security to off
as $$
  select coalesce(
    (
      select role = any (array['host'::text, 'admin'::text])
      from public.profiles
      where id = check_user_id
      limit 1
    ),
    false
  );
$$;

revoke all on function public.profile_role(uuid) from public;
revoke all on function public.is_admin(uuid) from public;
revoke all on function public.is_host_or_admin(uuid) from public;

grant execute on function public.profile_role(uuid) to authenticated, service_role;
grant execute on function public.is_admin(uuid) to authenticated, service_role;
grant execute on function public.is_host_or_admin(uuid) to authenticated, service_role;

drop policy if exists "Users can update their own profile except role" on public.profiles;

create policy "Users can update their own profile except role"
on public.profiles
as permissive
for update
to authenticated
using ((select auth.uid()) = id)
with check (
  (select auth.uid()) = id
  and role is not distinct from public.profile_role((select auth.uid()))
);

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
