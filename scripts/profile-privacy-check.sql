-- Read-only proof that member profile privacy holds after
-- 20261112010000_member_profile_privacy.sql is applied.
-- These statements do not insert, update, or delete.

-- The broad member policy is gone. Own-row and admin select policies remain.
select policyname, cmd, roles::text
from pg_policies
where schemaname = 'public'
  and tablename = 'profiles'
order by policyname;

-- No profiles policy is granted to anon.
select policyname, roles::text
from pg_policies
where schemaname = 'public'
  and tablename = 'profiles'
  and 'anon' = any (roles);

-- Safe view columns. Private columns must be absent.
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'member_directory_profiles'
order by ordinal_position;

-- anon and public cannot select the safe view. authenticated can.
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'member_directory_profiles'
  and grantee in ('anon', 'authenticated', 'public')
order by grantee, privilege_type;

-- As an approved member (SQL editor role: authenticated, sub = that member):
-- select id, email from public.profiles where id = auth.uid();
-- select id, email from public.profiles where id <> auth.uid();
-- select id from public.member_profiles where id <> auth.uid();
-- select id, contact_email, show_contact_email from public.member_directory_profiles where id <> auth.uid();
-- select id from public.member_directory_profiles where application_status <> 'approved' or removed_at is not null;

-- As anon:
-- set role anon;
-- select id from public.profiles limit 1;
-- select id from public.member_profiles limit 1;
-- select id from public.member_directory_profiles limit 1;
-- reset role;
