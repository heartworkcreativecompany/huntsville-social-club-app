-- New pending or viewed recommendations require accepted identity for both
-- members. Accepted identity is Stripe status verified, or an active unrevoked
-- in-person row. Payment and Circle tier are not evidence.
--
-- Existing recommendation rows are not updated or deleted. Statuses other than
-- pending and viewed, including passed and expired, can still be written when
-- identity is missing so cleanup can close a row. Moving a row back to pending
-- or viewed is checked again.
--
-- The member SELECT policies below replace only the owner-only read policies.
-- Dating keeps its existing admin SELECT policy and its existing member
-- lifecycle UPDATE policy. This file does not grant any new member update
-- and does not make a hidden row visible. Friendship has no authenticated
-- admin or update policy, and this file does not add one.
-- service_role bypasses row security and is stopped by the trigger instead.
--
-- matching_identity_reader owns the functions. It is nologin, cannot bypass
-- row security, and is not a member of the API roles. Its SELECT policies let
-- the functions read evidence without re-entering a member policy. Members
-- cannot assume the role. CREATE on schema public is revoked before this file
-- finishes. The functions do not call auth.*, because this migration role
-- cannot grant schema auth.

do $role$
begin
  if not exists (
    select 1 from pg_catalog.pg_roles where rolname = 'matching_identity_reader'
  ) then
    create role matching_identity_reader
      nologin
      nocreaterole
      nocreatedb;
  elsif exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = 'matching_identity_reader'
      and (
        rolsuper
        or rolbypassrls
        or rolreplication
      )
  ) then
    raise exception 'matching_identity_reader has unexpected attributes';
  else
    alter role matching_identity_reader
      nologin
      nocreaterole
      nocreatedb;
  end if;
end
$role$;

do $revoke_members$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
    revoke matching_identity_reader from anon;
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    revoke matching_identity_reader from authenticated;
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    revoke matching_identity_reader from service_role;
  end if;
end
$revoke_members$;

do $assert_public_usage$
begin
  if not pg_catalog.has_schema_privilege(
    'matching_identity_reader',
    'public',
    'USAGE'
  ) then
    raise exception 'matching_identity_reader lacks effective USAGE on schema public';
  end if;
  if not pg_catalog.has_language_privilege(
    'matching_identity_reader',
    'plpgsql',
    'USAGE'
  ) then
    raise exception 'matching_identity_reader lacks effective USAGE on language plpgsql';
  end if;
end
$assert_public_usage$;

grant select (id, identity_verification_status)
  on table public.profiles
  to matching_identity_reader;
grant select (profile_id, method, status, revoked_at)
  on table public.in_person_identity_verifications
  to matching_identity_reader;
grant select (id, user_id, recommended_user_id)
  on table public.curated_match_recommendations
  to matching_identity_reader;
grant select (id, user_id, recommended_user_id)
  on table public.friendship_match_recommendations
  to matching_identity_reader;

drop policy if exists matching_identity_reader_reads_profile_evidence
  on public.profiles;
create policy matching_identity_reader_reads_profile_evidence
  on public.profiles
  for select
  to matching_identity_reader
  using (true);

drop policy if exists matching_identity_reader_reads_in_person_evidence
  on public.in_person_identity_verifications;
create policy matching_identity_reader_reads_in_person_evidence
  on public.in_person_identity_verifications
  for select
  to matching_identity_reader
  using (true);

drop policy if exists matching_identity_reader_reads_curated_recommendations
  on public.curated_match_recommendations;
create policy matching_identity_reader_reads_curated_recommendations
  on public.curated_match_recommendations
  for select
  to matching_identity_reader
  using (true);

drop policy if exists matching_identity_reader_reads_friendship_recommendations
  on public.friendship_match_recommendations;
create policy matching_identity_reader_reads_friendship_recommendations
  on public.friendship_match_recommendations
  for select
  to matching_identity_reader
  using (true);

do $grant_runner$
begin
  execute format('grant matching_identity_reader to %I', current_user);
end
$grant_runner$;

grant trigger on table public.curated_match_recommendations
  to matching_identity_reader;
grant trigger on table public.friendship_match_recommendations
  to matching_identity_reader;
grant create on schema public to matching_identity_reader;
set local role matching_identity_reader;

create or replace function public.profile_has_accepted_identity_evidence(check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.profiles
    where id = check_user_id
      and identity_verification_status = 'verified'
  )
  or exists (
    select 1
    from public.in_person_identity_verifications
    where profile_id = check_user_id
      and method = 'in_person'
      and status = 'verified'
      and revoked_at is null
  );
$function$;

create or replace function public.reject_matching_without_accepted_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status in ('pending', 'viewed') then
    if not public.profile_has_accepted_identity_evidence(new.user_id)
       or not public.profile_has_accepted_identity_evidence(new.recommended_user_id) then
      raise exception 'accepted identity is required for matching'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.curated_match_recommendation_visible(recommendation_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  actor uuid;
  viewer_id uuid;
  candidate_id uuid;
begin
  actor := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''::text),
    (
      nullif(pg_catalog.current_setting('request.jwt.claims', true), ''::text)::jsonb
      ->> 'sub'
    )
  )::uuid;
  if actor is null then
    return false;
  end if;

  select recommendation.user_id, recommendation.recommended_user_id
    into viewer_id, candidate_id
  from public.curated_match_recommendations as recommendation
  where recommendation.id = recommendation_id;

  if viewer_id is null or viewer_id is distinct from actor then
    return false;
  end if;

  return public.profile_has_accepted_identity_evidence(viewer_id)
    and public.profile_has_accepted_identity_evidence(candidate_id);
end;
$function$;

create or replace function public.friendship_match_recommendation_visible(recommendation_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  actor uuid;
  viewer_id uuid;
  candidate_id uuid;
begin
  actor := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''::text),
    (
      nullif(pg_catalog.current_setting('request.jwt.claims', true), ''::text)::jsonb
      ->> 'sub'
    )
  )::uuid;
  if actor is null then
    return false;
  end if;

  select recommendation.user_id, recommendation.recommended_user_id
    into viewer_id, candidate_id
  from public.friendship_match_recommendations as recommendation
  where recommendation.id = recommendation_id;

  if viewer_id is null or viewer_id is distinct from actor then
    return false;
  end if;

  return public.profile_has_accepted_identity_evidence(viewer_id)
    and public.profile_has_accepted_identity_evidence(candidate_id);
end;
$function$;

revoke all on function public.profile_has_accepted_identity_evidence(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.reject_matching_without_accepted_identity()
  from public, anon, authenticated, service_role;
revoke all on function public.curated_match_recommendation_visible(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.friendship_match_recommendation_visible(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.reject_matching_without_accepted_identity()
  to service_role;
grant execute on function public.curated_match_recommendation_visible(uuid)
  to authenticated;
grant execute on function public.friendship_match_recommendation_visible(uuid)
  to authenticated;

comment on function public.profile_has_accepted_identity_evidence(uuid) is
  'Stripe verified or active unrevoked in-person evidence. Not granted to API roles.';

comment on function public.reject_matching_without_accepted_identity() is
  'Rejects pending or viewed recommendation writes unless both members have accepted identity.';

comment on function public.curated_match_recommendation_visible(uuid) is
  'True only when the caller owns that dating recommendation and both members have accepted identity.';

comment on function public.friendship_match_recommendation_visible(uuid) is
  'True only when the caller owns that friendship recommendation and both members have accepted identity.';

drop trigger if exists curated_match_requires_accepted_identity
  on public.curated_match_recommendations;
create trigger curated_match_requires_accepted_identity
  before insert or update on public.curated_match_recommendations
  for each row
  execute function public.reject_matching_without_accepted_identity();

drop trigger if exists friendship_match_requires_accepted_identity
  on public.friendship_match_recommendations;
create trigger friendship_match_requires_accepted_identity
  before insert or update on public.friendship_match_recommendations
  for each row
  execute function public.reject_matching_without_accepted_identity();

reset role;
revoke create on schema public from matching_identity_reader;
revoke trigger on table public.curated_match_recommendations
  from matching_identity_reader;
revoke trigger on table public.friendship_match_recommendations
  from matching_identity_reader;

drop policy if exists "Members read own curated match recommendations"
  on public.curated_match_recommendations;
create policy "Members read own curated match recommendations"
  on public.curated_match_recommendations
  for select
  to authenticated
  using ((select public.curated_match_recommendation_visible(id)));

drop policy if exists "Members read own friendship match recommendations"
  on public.friendship_match_recommendations;
create policy "Members read own friendship match recommendations"
  on public.friendship_match_recommendations
  for select
  to authenticated
  using ((select public.friendship_match_recommendation_visible(id)));

do $assert_reader_scope$
begin
  if pg_catalog.has_schema_privilege(
    'matching_identity_reader',
    'public',
    'CREATE'
  ) then
    raise exception 'matching_identity_reader must not keep CREATE on schema public';
  end if;
  if pg_catalog.has_table_privilege(
    'matching_identity_reader',
    'public.curated_match_recommendations',
    'TRIGGER'
  ) or pg_catalog.has_table_privilege(
    'matching_identity_reader',
    'public.friendship_match_recommendations',
    'TRIGGER'
  ) then
    raise exception 'matching_identity_reader must not keep TRIGGER on recommendation tables';
  end if;
  if exists (
    select 1
    from pg_catalog.pg_namespace as namespace
    cross join lateral pg_catalog.aclexplode(namespace.nspacl) as acl
    join pg_catalog.pg_roles as grantee on grantee.oid = acl.grantee
    where namespace.nspname = 'auth'
      and grantee.rolname = 'matching_identity_reader'
  ) then
    raise exception 'matching_identity_reader must not receive an auth schema grant';
  end if;
  if exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = 'matching_identity_reader'
      and (
        rolsuper
        or rolcreaterole
        or rolcreatedb
        or rolcanlogin
        or rolbypassrls
        or rolreplication
      )
  ) then
    raise exception 'matching_identity_reader has elevated role attributes';
  end if;
  if exists (
    select 1
    from pg_catalog.pg_auth_members as membership
    join pg_catalog.pg_roles as member_role on member_role.oid = membership.member
    join pg_catalog.pg_roles as granted_role on granted_role.oid = membership.roleid
    where member_role.rolname = 'matching_identity_reader'
      and granted_role.rolname in (
        'anon',
        'authenticated',
        'service_role',
        'postgres',
        'pg_database_owner',
        'supabase_admin',
        'supabase_auth_admin'
      )
  ) then
    raise exception 'matching_identity_reader has a forbidden role membership';
  end if;
  if exists (
    select 1
    from pg_catalog.pg_proc as proc
    join pg_catalog.pg_namespace as namespace on namespace.oid = proc.pronamespace
    join pg_catalog.pg_roles as owner_role on owner_role.oid = proc.proowner
    where namespace.nspname = 'public'
      and proc.proname in (
        'profile_has_accepted_identity_evidence',
        'reject_matching_without_accepted_identity',
        'curated_match_recommendation_visible',
        'friendship_match_recommendation_visible'
      )
      and owner_role.rolname is distinct from 'matching_identity_reader'
  ) then
    raise exception 'matching identity functions must be owned by matching_identity_reader';
  end if;
end
$assert_reader_scope$;
