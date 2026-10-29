-- Account-page marketing preference.
--
-- State model, with no new columns:
-- A member is locally opted in only when email_marketing_opt_in is true
-- and email_marketing_opted_out_at is null. Anything else is off.
-- Provider subscription is not stored on the profile and is not an argument
-- this function accepts. Checking Resend inside this transaction is not
-- possible here, and a member-supplied flag would be forgeable.
--
-- set_own_email_marketing_preference is the authenticated entry point.
-- Opt-out uses the existing withdrawal, including its sync job.
-- Opt-in does not change the profile and does not queue enroll. It raises
-- pending_provider_confirmation. A completed call is not an opt-in.
--
-- commit_email_marketing_opt_in is service-role only. The application may
-- call it only after a provider lookup, made outside this transaction,
-- showed the contact missing or subscribed. checked_at is the time of that
-- lookup. A withdrawal newer than checked_at wins: the function returns
-- blocked_resubscription, leaves the row off, and does not queue enroll.
-- The existing sync worker still refuses to send unsubscribed=false when
-- the provider contact is unsubscribed.

drop function if exists public.set_own_email_marketing_preference(boolean);

create or replace function public.set_own_email_marketing_preference(opt_in boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor uuid;
begin
  actor := auth.uid();
  if actor is null or coalesce(auth.role(), '') is distinct from 'authenticated' then
    raise exception 'authentication required'
      using errcode = '42501';
  end if;

  if opt_in is null then
    raise exception 'invalid marketing preference'
      using errcode = '22023';
  end if;

  if opt_in is false then
    perform public.apply_email_marketing_withdrawal(actor);
    return 'opted_out';
  end if;

  -- The member cannot prove the provider state from here. Leave every
  -- marketing column and the sync queue unchanged.
  raise exception 'pending_provider_confirmation'
    using errcode = 'P0001';
end;
$function$;

alter function public.set_own_email_marketing_preference(boolean)
  owner to consent_writer;

revoke all on function public.set_own_email_marketing_preference(boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.set_own_email_marketing_preference(boolean)
  to authenticated;

create or replace function public.commit_email_marketing_opt_in(
  target_id uuid,
  checked_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_opt_out timestamptz;
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'forbidden'
      using errcode = '42501';
  end if;

  if target_id is null or checked_at is null then
    raise exception 'invalid marketing preference'
      using errcode = '22023';
  end if;

  select profile.email_marketing_opted_out_at
  into current_opt_out
  from public.profiles as profile
  where profile.id = target_id
  for update;

  if not found then
    raise exception 'profile not found'
      using errcode = 'P0002';
  end if;

  if current_opt_out is not null and current_opt_out > checked_at then
    return 'blocked_resubscription';
  end if;

  update public.profiles
  set
    email_marketing_opt_in = true,
    email_marketing_opt_in_at = case
      when email_marketing_opt_in is true and email_marketing_opted_out_at is null
        then email_marketing_opt_in_at
      else pg_catalog.now()
    end,
    email_marketing_consent_source = case
      when email_marketing_opt_in is true
        and email_marketing_opted_out_at is null
        and email_marketing_consent_source is not null
        then email_marketing_consent_source
      else 'account_preference'
    end,
    email_marketing_consent_version = case
      when email_marketing_opt_in is true
        and email_marketing_opted_out_at is null
        and email_marketing_consent_version is not null
        then email_marketing_consent_version
      else '2026-10-07-email-marketing'
    end,
    email_marketing_opted_out_at = null
  where id = target_id
    and (
      email_marketing_opt_in is distinct from true
      or email_marketing_opted_out_at is not null
    );

  -- A not-yet-finished withdrawal would undo this opt-in when the worker
  -- reached it. Skip that local job. A provider unsubscribe that lands
  -- after checked_at is handled above, and the enroll worker still looks
  -- the contact up before it can send unsubscribed=false.
  update public.email_marketing_sync
  set
    status = 'skipped',
    last_error = 'replaced_by_account_opt_in',
    lease_owner = null,
    lease_expires_at = null,
    updated_at = pg_catalog.now()
  where profile_id = target_id
    and action = 'withdraw'
    and status in ('pending', 'processing');

  insert into public.email_marketing_sync (profile_id, action, status)
  select profile.id, 'enroll', 'pending'
  from public.profiles as profile
  where profile.id = target_id
    and profile.email_marketing_opt_in is true
    and profile.email_marketing_opted_out_at is null
    and not exists (
      select 1
      from public.email_marketing_sync as existing
      where existing.profile_id = profile.id
        and existing.action = 'enroll'
        and existing.status in ('pending', 'processing')
    );

  return 'opted_in';
end;
$function$;

alter function public.commit_email_marketing_opt_in(uuid, timestamptz)
  owner to consent_writer;

revoke all on function public.commit_email_marketing_opt_in(uuid, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.commit_email_marketing_opt_in(uuid, timestamptz)
  to service_role;

comment on function public.set_own_email_marketing_preference(boolean) is
  'Authenticated opt-out uses the existing withdrawal. Authenticated opt-in raises pending_provider_confirmation and does not write.';

comment on function public.commit_email_marketing_opt_in(uuid, timestamptz) is
  'Service-role opt-in after an external provider check. A newer local withdrawal returns blocked_resubscription without an enroll job.';
