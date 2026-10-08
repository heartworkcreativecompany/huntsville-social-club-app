-- Representative baseline for signup email consent.
--
-- This is not production and it is not the historical migration chain.
-- Apply this file, then only
-- supabase/migrations/20261007180000_signup_email_consent.sql.
-- The command is `npm run test:integration:signup-consent`.
--
-- The baseline matches the objects that migration reads or replaces:
-- auth.users (from the Supabase Postgres image). That image's initial
-- schema has confirmed_at. The harness, as supabase_admin, adds
-- email_confirmed_at before this file because production has that column
-- and the consent migration's confirmation trigger uses it.
-- public.profiles with
-- id, email, role, and full_name, the existing on_auth_user_created
-- trigger, and member self-select and self-update policies. An update
-- cannot see an existing row unless a select policy allows it too.
-- It does not replay the
-- statements listed in docs/signup-email-consent-rollout.md that stop
-- a fresh run of the full chain.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  role text not null default 'member',
  full_name text
);

alter table public.profiles enable row level security;

drop policy if exists "Users can view their own profile"
  on public.profiles;
create policy "Users can view their own profile"
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()));

drop policy if exists "Users can update their own profile except role"
  on public.profiles;
create policy "Users can update their own profile except role"
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

grant select, insert, update, delete on table public.profiles
  to anon, authenticated, service_role;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'member')
  on conflict (id) do nothing;

  return new;
end;
$function$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
