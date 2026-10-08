-- Signup given and family names.
--
-- These columns are the names collected at account creation. They are not
-- profiles.full_name, which remains the separate public display name.
-- Existing accounts stay null. Family name may be null for a single name.
-- Members cannot update these columns; profile creation writes them.

alter table public.profiles
  add column if not exists given_name text,
  add column if not exists family_name text;

alter table public.profiles
  drop constraint if exists profiles_given_name_check;

alter table public.profiles
  add constraint profiles_given_name_check
  check (
    given_name is null
    or (
      char_length(given_name) between 1 and 80
      and given_name = btrim(given_name)
      and given_name !~ '[[:cntrl:]]'
      and given_name !~ '[[:space:]]{2,}'
    )
  );

alter table public.profiles
  drop constraint if exists profiles_family_name_check;

alter table public.profiles
  add constraint profiles_family_name_check
  check (
    family_name is null
    or (
      char_length(family_name) between 1 and 80
      and family_name = btrim(family_name)
      and family_name !~ '[[:cntrl:]]'
      and family_name !~ '[[:space:]]{2,}'
    )
  );

comment on column public.profiles.given_name is
  'Signup given name. Not the public display name in full_name. Null when the account was created without a signup name.';

comment on column public.profiles.family_name is
  'Signup family name. Optional for a single name. Not the public display name in full_name.';

revoke update (given_name, family_name) on table public.profiles
  from public, anon, authenticated;

create or replace function public.signup_name_from_metadata(meta jsonb, metadata_key text)
returns text
language plpgsql
immutable
set search_path = ''
as $function$
declare
  raw_text text;
  cleaned text;
begin
  if meta is null
    or pg_catalog.jsonb_typeof(meta -> metadata_key) is distinct from 'string' then
    return null;
  end if;

  raw_text := meta ->> metadata_key;
  cleaned := pg_catalog.btrim(
    pg_catalog.regexp_replace(raw_text, '[[:space:]]+', ' ', 'g')
  );

  if cleaned = ''
    or pg_catalog.char_length(cleaned) > 80
    or cleaned ~ '[[:cntrl:]]' then
    return null;
  end if;

  return cleaned;
end;
$function$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  essential_acknowledged boolean;
  marketing_opt_in boolean;
  signup_given_name text;
  signup_family_name text;
begin
  signup_given_name := public.signup_name_from_metadata(new.raw_user_meta_data, 'given_name');
  signup_family_name := public.signup_name_from_metadata(new.raw_user_meta_data, 'family_name');

  insert into public.profiles (id, email, role, given_name, family_name)
  values (new.id, new.email, 'member', signup_given_name, signup_family_name)
  on conflict (id) do nothing;

  if not found then
    return new;
  end if;

  essential_acknowledged :=
    coalesce(
      (new.raw_user_meta_data -> 'essential_email_acknowledgement') = 'true'::jsonb,
      false
    );
  marketing_opt_in :=
    coalesce(
      (new.raw_user_meta_data -> 'email_marketing_opt_in') = 'true'::jsonb,
      false
    );

  if essential_acknowledged or marketing_opt_in then
    perform public.record_signup_email_consent(
      new.id,
      essential_acknowledged,
      marketing_opt_in
    );
  end if;

  if marketing_opt_in and new.email_confirmed_at is not null then
    insert into public.email_marketing_sync (profile_id, action, status)
    select profile.id, 'enroll', 'pending'
    from public.profiles as profile
    where profile.id = new.id
      and profile.email_marketing_opt_in is true
      and profile.email_marketing_opted_out_at is null
      and not exists (
        select 1
        from public.email_marketing_sync as existing
        where existing.profile_id = profile.id
          and existing.action = 'enroll'
          and existing.status in ('pending', 'processing')
      );
  end if;

  return new;
end;
$function$;

create or replace function public.explicit_application_name(draft jsonb, field_name text)
returns text
language plpgsql
immutable
set search_path = ''
as $function$
declare
  raw_value jsonb;
  cleaned text;
begin
  if draft is null or pg_catalog.jsonb_typeof(draft) is distinct from 'object' then
    return null;
  end if;

  raw_value := draft #> array['profile', field_name];
  if pg_catalog.jsonb_typeof(raw_value) is distinct from 'string' then
    return null;
  end if;

  cleaned := pg_catalog.btrim(draft #>> array['profile', field_name]);
  if cleaned = '' then
    return null;
  end if;

  return cleaned;
end;
$function$;

comment on function public.explicit_application_name(jsonb, text) is
  'Trimmed application_draft.profile first or last name. Does not read full_name or displayName.';

drop function if exists public.recheck_email_marketing_sync(uuid);

create function public.recheck_email_marketing_sync(target_job_id uuid)
returns table (
  job_id uuid,
  profile_id uuid,
  action text,
  decision text,
  recipient_email text,
  given_name text,
  family_name text,
  application_first_name text,
  application_last_name text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  sync_row public.email_marketing_sync%rowtype;
  profile_row public.profiles%rowtype;
  confirmed_at timestamptz;
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'forbidden'
      using errcode = '42501';
  end if;

  select *
  into sync_row
  from public.email_marketing_sync
  where id = target_job_id;

  if not found then
    job_id := target_job_id;
    profile_id := null;
    action := null;
    decision := 'missing_job';
    recipient_email := null;
    given_name := null;
    family_name := null;
    application_first_name := null;
    application_last_name := null;
    return next;
    return;
  end if;

  select *
  into profile_row
  from public.profiles
  where id = sync_row.profile_id
  for update;

  select users.email_confirmed_at
  into confirmed_at
  from auth.users as users
  where users.id = sync_row.profile_id;

  job_id := sync_row.id;
  profile_id := sync_row.profile_id;
  action := sync_row.action;
  recipient_email := profile_row.email;
  given_name := profile_row.given_name;
  family_name := profile_row.family_name;
  application_first_name := public.explicit_application_name(
    pg_catalog.to_jsonb(profile_row) -> 'application_draft',
    'firstName'
  );
  application_last_name := public.explicit_application_name(
    pg_catalog.to_jsonb(profile_row) -> 'application_draft',
    'lastName'
  );

  if profile_row.email is null or length(btrim(profile_row.email)) = 0 then
    decision := 'skip_no_email';
  elsif sync_row.action = 'withdraw' then
    decision := 'send_unsubscribed_true';
  elsif profile_row.email_marketing_opted_out_at is not null then
    decision := 'skip_withdrawn';
  elsif profile_row.email_marketing_opt_in is not true then
    decision := 'skip_not_opted_in';
  elsif confirmed_at is null then
    decision := 'defer_unconfirmed';
  else
    decision := 'send_unsubscribed_false';
  end if;

  return next;
end;
$function$;

revoke all on function public.recheck_email_marketing_sync(uuid)
  from public, anon, authenticated;
grant execute on function public.recheck_email_marketing_sync(uuid) to service_role;

revoke all on function public.handle_new_user()
  from public, anon, authenticated;
