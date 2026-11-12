-- Proof checks for 20261112010000_member_profile_privacy.sql.
-- Catalog queries are read-only. The simulated session block writes only
-- inside a transaction that rolls back, so it does not keep any rows.

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

-- Cross-member policies use the definer helper instead of selecting the other row.
select tablename, policyname
from pg_policies
where schemaname in ('public', 'storage')
  and (
    (tablename = 'member_vouches' and policyname = 'Approved members create vouches')
    or (
      tablename = 'objects'
      and policyname = 'Approved members read approved member photos'
    )
  )
  and (
    qual ilike '%is_approved_active_member%'
    or with_check ilike '%is_approved_active_member%'
  );

-- Simulated sessions. Uses existing profiles. Writes roll back.
begin;

select set_config(
  'profile_privacy.member_a',
  (
    select id::text
    from public.profiles
    where application_status = 'approved' and removed_at is null
    order by created_at
    limit 1
  ),
  true
);
select set_config(
  'profile_privacy.member_b',
  (
    select id::text
    from public.profiles
    where application_status = 'approved'
      and removed_at is null
      and id::text is distinct from current_setting('profile_privacy.member_a', true)
    order by created_at
    limit 1
  ),
  true
);
select set_config(
  'profile_privacy.blocked',
  (
    select id::text
    from public.profiles
    where application_status is distinct from 'approved' or removed_at is not null
    order by created_at
    limit 1
  ),
  true
);
select set_config(
  'profile_privacy.host',
  (
    select id::text
    from public.profiles
    where role = 'host' and removed_at is null
    order by created_at
    limit 1
  ),
  true
);

insert into storage.objects (bucket_id, name)
select
  'application-photos',
  current_setting('profile_privacy.member_b') || '/privacy-probe.jpg'
where current_setting('profile_privacy.member_b', true) is not null;

insert into storage.objects (bucket_id, name)
select
  'application-photos',
  current_setting('profile_privacy.blocked') || '/privacy-probe.jpg'
where current_setting('profile_privacy.blocked', true) is not null;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', current_setting('profile_privacy.member_a'),
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

-- Succeeds for another approved, not-removed member.
insert into public.member_vouches (
  voucher_id,
  vouchee_id,
  vouch_type,
  relationship_context
)
values (
  current_setting('profile_privacy.member_a')::uuid,
  current_setting('profile_privacy.member_b')::uuid,
  'community',
  'Club events'
);

-- Photo path for that member is visible. The blocked member's path is not.
select name
from storage.objects
where bucket_id = 'application-photos'
  and name like '%/privacy-probe.jpg';

select
  public.is_approved_active_member(current_setting('profile_privacy.member_b')::uuid)
    as other_approved_member,
  public.is_approved_active_member(current_setting('profile_privacy.blocked', true)::uuid)
    as removed_or_unapproved_member;

-- Denied. A successful insert raises instead of continuing.
do $probe$
begin
  insert into public.member_vouches (
    voucher_id,
    vouchee_id,
    vouch_type,
    relationship_context
  )
  values (
    current_setting('profile_privacy.member_a')::uuid,
    current_setting('profile_privacy.blocked')::uuid,
    'personal',
    'Should be denied'
  );
  raise exception 'blocked vouch was allowed';
exception
  when insufficient_privilege then
    null;
end
$probe$;

reset role;

-- Host viewer, when one exists, can read other approved names.
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', coalesce(
      current_setting('profile_privacy.host', true),
      current_setting('profile_privacy.member_a')
    ),
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

select id, full_name
from public.member_directory_profiles
where id is distinct from auth.uid()
limit 5;

reset role;

-- Anon gets nothing.
set local role anon;
select id from public.profiles limit 1;
select id from public.member_profiles limit 1;
select id from public.member_directory_profiles limit 1;
reset role;

rollback;
