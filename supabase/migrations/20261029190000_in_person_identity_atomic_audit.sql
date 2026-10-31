-- Record and revoke in-person identity in one transaction with the moderation audit.
-- An audit failure raises and rolls the verification change back.
-- The acting admin is the authenticated request JWT subject, using the same
-- claim order as auth.uid() and auth.role(). The functions do not accept an
-- actor id and do not call auth.*, because this migration role cannot grant
-- schema auth.
-- Timestamps are database clocks. This does not write Stripe status,
-- membership approval, subscription, or suspension.
--
-- anon and authenticated still have no direct privileges on
-- in_person_identity_verifications. The existing service_role grant on that
-- table is unchanged. service_role is not granted these functions.
--
-- PUBLIC already has USAGE on schema public, so the writer is not granted it
-- again. CREATE on schema public is granted only for the function-ownership
-- statements below and is revoked before this file finishes. The outer
-- migration transaction must stay open across those statements.
--
-- The function, its policies, its revoke, and its grant are one migration.
-- A failure cannot leave EXECUTE granted to PUBLIC or CREATE granted to the
-- writer.

do $role$
begin
  if not exists (
    select 1 from pg_catalog.pg_roles where rolname = 'in_person_identity_writer'
  ) then
    create role in_person_identity_writer
      nologin
      nocreaterole
      nocreatedb;
  else
    alter role in_person_identity_writer
      nologin
      nocreaterole
      nocreatedb;
  end if;
end
$role$;

do $revoke_members$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
    revoke in_person_identity_writer from anon;
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    revoke in_person_identity_writer from authenticated;
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    revoke in_person_identity_writer from service_role;
  end if;
end
$revoke_members$;

do $assert_public_usage$
begin
  if not pg_catalog.has_schema_privilege(
    'in_person_identity_writer',
    'public',
    'USAGE'
  ) then
    raise exception 'in_person_identity_writer lacks effective USAGE on schema public';
  end if;
  if not pg_catalog.has_language_privilege(
    'in_person_identity_writer',
    'plpgsql',
    'USAGE'
  ) then
    raise exception 'in_person_identity_writer lacks effective USAGE on language plpgsql';
  end if;
end
$assert_public_usage$;

grant select, insert, update
  on table public.in_person_identity_verifications
  to in_person_identity_writer;
grant insert on table public.moderation_actions to in_person_identity_writer;
grant select on table public.profiles to in_person_identity_writer;
grant execute on function public.is_admin(uuid) to in_person_identity_writer;

drop policy if exists in_person_identity_writer_reads_profiles on public.profiles;
create policy in_person_identity_writer_reads_profiles
  on public.profiles
  for select
  to in_person_identity_writer
  using (true);

drop policy if exists in_person_identity_writer_reads_verifications
  on public.in_person_identity_verifications;
create policy in_person_identity_writer_reads_verifications
  on public.in_person_identity_verifications
  for select
  to in_person_identity_writer
  using (true);

drop policy if exists in_person_identity_writer_inserts_verifications
  on public.in_person_identity_verifications;
create policy in_person_identity_writer_inserts_verifications
  on public.in_person_identity_verifications
  for insert
  to in_person_identity_writer
  with check (true);

drop policy if exists in_person_identity_writer_updates_verifications
  on public.in_person_identity_verifications;
create policy in_person_identity_writer_updates_verifications
  on public.in_person_identity_verifications
  for update
  to in_person_identity_writer
  using (true)
  with check (true);

drop policy if exists in_person_identity_writer_inserts_audits
  on public.moderation_actions;
create policy in_person_identity_writer_inserts_audits
  on public.moderation_actions
  for insert
  to in_person_identity_writer
  with check (
    action_type = any (array[
      'in_person_identity_verified'::text,
      'in_person_identity_revoked'::text
    ])
    and source_type = 'in_person_identity_verification'
  );

do $grant_runner$
begin
  execute format('grant in_person_identity_writer to %I', current_user);
end
$grant_runner$;

grant create on schema public to in_person_identity_writer;
set local role in_person_identity_writer;

create or replace function public.record_in_person_identity_verification(
  target_profile_id uuid,
  confirmed boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor uuid;
  session_role text;
  existing_id uuid;
  inserted_id uuid;
begin
  actor := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''::text),
    (nullif(pg_catalog.current_setting('request.jwt.claims', true), ''::text)::jsonb ->> 'sub')
  )::uuid;
  session_role := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claim.role', true), ''::text),
    (nullif(pg_catalog.current_setting('request.jwt.claims', true), ''::text)::jsonb ->> 'role')
  );
  if actor is null or session_role is distinct from 'authenticated' then
    raise exception 'authentication required'
      using errcode = '42501';
  end if;
  if not public.is_admin(actor) then
    raise exception 'Administrator access required.'
      using errcode = '42501';
  end if;
  if confirmed is not true then
    raise exception 'Confirm the in-person identity check before recording it.'
      using errcode = '22023';
  end if;
  if target_profile_id is null or not exists (
    select 1 from public.profiles where id = target_profile_id
  ) then
    raise exception 'Member not found.'
      using errcode = 'P0002';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_profile_id::text, 0::bigint)
  );

  select verification.id
  into existing_id
  from public.in_person_identity_verifications as verification
  where verification.profile_id = target_profile_id
    and verification.method = 'in_person'
    and verification.status = 'verified'
    and verification.revoked_at is null
  for update;

  if existing_id is not null then
    return pg_catalog.jsonb_build_object(
      'id', existing_id,
      'already_verified', true
    );
  end if;

  insert into public.in_person_identity_verifications (
    profile_id,
    method,
    status,
    source,
    approved_by,
    approved_at,
    reconciled_at,
    note
  ) values (
    target_profile_id,
    'in_person',
    'verified',
    'admin_action',
    actor,
    pg_catalog.now(),
    null,
    null
  )
  returning id into inserted_id;

  insert into public.moderation_actions (
    actor_id,
    target_member_id,
    action_type,
    source_type,
    source_id,
    details
  ) values (
    actor,
    target_profile_id,
    'in_person_identity_verified',
    'in_person_identity_verification',
    inserted_id,
    pg_catalog.jsonb_build_object(
      'method', 'in_person',
      'source', 'admin_action'
    )::text
  );

  return pg_catalog.jsonb_build_object(
    'id', inserted_id,
    'already_verified', false
  );
end;
$function$;

create or replace function public.revoke_in_person_identity_verification(
  target_profile_id uuid,
  reason text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor uuid;
  session_role text;
  existing_id uuid;
  updated_id uuid;
  clean_reason text;
begin
  actor := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''::text),
    (nullif(pg_catalog.current_setting('request.jwt.claims', true), ''::text)::jsonb ->> 'sub')
  )::uuid;
  session_role := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claim.role', true), ''::text),
    (nullif(pg_catalog.current_setting('request.jwt.claims', true), ''::text)::jsonb ->> 'role')
  );
  if actor is null or session_role is distinct from 'authenticated' then
    raise exception 'authentication required'
      using errcode = '42501';
  end if;
  if not public.is_admin(actor) then
    raise exception 'Administrator access required.'
      using errcode = '42501';
  end if;

  clean_reason := pg_catalog.btrim(coalesce(reason, ''::text));
  if clean_reason = '' then
    raise exception 'A revocation reason is required.'
      using errcode = '22023';
  end if;
  if pg_catalog.char_length(clean_reason) > 280 then
    raise exception 'Keep the revocation reason to 280 characters.'
      using errcode = '22023';
  end if;
  if clean_reason ~ '\d{6,}' then
    raise exception 'Do not include document numbers or biometric data.'
      using errcode = '22023';
  end if;

  if target_profile_id is null or not exists (
    select 1 from public.profiles where id = target_profile_id
  ) then
    raise exception 'Member not found.'
      using errcode = 'P0002';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_profile_id::text, 0::bigint)
  );

  select verification.id
  into existing_id
  from public.in_person_identity_verifications as verification
  where verification.profile_id = target_profile_id
    and verification.method = 'in_person'
    and verification.status = 'verified'
    and verification.revoked_at is null
  for update;

  if existing_id is null then
    raise exception 'No in-person identity verification is active.'
      using errcode = 'P0002';
  end if;

  update public.in_person_identity_verifications
  set
    status = 'revoked',
    revoked_at = pg_catalog.now(),
    revoked_by = actor
  where id = existing_id
    and revoked_at is null
  returning id into updated_id;

  if updated_id is null then
    raise exception 'No in-person identity verification is active.'
      using errcode = 'P0002';
  end if;

  insert into public.moderation_actions (
    actor_id,
    target_member_id,
    action_type,
    source_type,
    source_id,
    reason,
    details
  ) values (
    actor,
    target_profile_id,
    'in_person_identity_revoked',
    'in_person_identity_verification',
    updated_id,
    clean_reason,
    pg_catalog.jsonb_build_object('method', 'in_person')::text
  );

  return pg_catalog.jsonb_build_object('id', updated_id);
end;
$function$;

revoke all on function public.record_in_person_identity_verification(uuid, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.revoke_in_person_identity_verification(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.record_in_person_identity_verification(uuid, boolean)
  to authenticated;
grant execute on function public.revoke_in_person_identity_verification(uuid, text)
  to authenticated;

comment on function public.record_in_person_identity_verification(uuid, boolean) is
  'Admin records in-person identity and its moderation audit in one transaction. Actor is the authenticated JWT subject.';

comment on function public.revoke_in_person_identity_verification(uuid, text) is
  'Admin revokes the active in-person identity and writes the audit reason in one transaction. Actor is the authenticated JWT subject.';

reset role;
revoke create on schema public from in_person_identity_writer;

do $assert_writer_scope$
begin
  if pg_catalog.has_schema_privilege(
    'in_person_identity_writer',
    'public',
    'CREATE'
  ) then
    raise exception 'in_person_identity_writer must not keep CREATE on schema public';
  end if;
  if exists (
    select 1
    from pg_catalog.pg_namespace as namespace
    cross join lateral pg_catalog.aclexplode(namespace.nspacl) as acl
    join pg_catalog.pg_roles as grantee on grantee.oid = acl.grantee
    where namespace.nspname = 'auth'
      and grantee.rolname = 'in_person_identity_writer'
  ) then
    raise exception 'in_person_identity_writer must not receive an auth schema grant';
  end if;
  if exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = 'in_person_identity_writer'
      and (
        rolsuper
        or rolcreaterole
        or rolcreatedb
        or rolcanlogin
        or rolbypassrls
        or rolreplication
      )
  ) then
    raise exception 'in_person_identity_writer has elevated role attributes';
  end if;
  if exists (
    select 1
    from pg_catalog.pg_auth_members as membership
    join pg_catalog.pg_roles as member_role on member_role.oid = membership.member
    join pg_catalog.pg_roles as granted_role on granted_role.oid = membership.roleid
    where member_role.rolname = 'in_person_identity_writer'
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
    raise exception 'in_person_identity_writer has a forbidden role membership';
  end if;
  if exists (
    select 1
    from pg_catalog.pg_proc as proc
    join pg_catalog.pg_namespace as namespace on namespace.oid = proc.pronamespace
    join pg_catalog.pg_roles as owner_role on owner_role.oid = proc.proowner
    where namespace.nspname = 'public'
      and proc.proname in (
        'record_in_person_identity_verification',
        'revoke_in_person_identity_verification'
      )
      and owner_role.rolname is distinct from 'in_person_identity_writer'
  ) then
    raise exception 'in-person identity functions must be owned by in_person_identity_writer';
  end if;
end
$assert_writer_scope$;
