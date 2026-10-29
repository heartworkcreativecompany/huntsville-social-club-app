-- One active entitlement cycle per member, replaced in a single transaction.
-- Does not update credits_granted, credits_used, guest_invites_granted,
-- guest_invites_used, or circle_social_credits_* on an existing row.
-- A failed replacement rolls back, so the previous cycle stays active.
-- If duplicate active cycles or duplicate period seconds already exist, this
-- migration raises and writes nothing. It does not pick a survivor or backfill.
--
-- The function, its revoke, and its grant are one migration. Supabase applies
-- a migration file in a single transaction, so a failure cannot leave EXECUTE
-- granted to PUBLIC, anon, or authenticated.
--
-- replace_membership_entitlement_cycle is SECURITY INVOKER with search_path
-- public. It does not read auth.uid(). A caller who can execute it chooses the
-- member id, grant amounts, and period. EXECUTE is therefore limited to
-- service_role. anon and authenticated are denied.

create or replace function public.entitlement_period_second(ts timestamptz)
returns bigint
language sql
immutable
security invoker
set search_path = public
as $$
  select floor(extract(epoch from ts))::bigint
$$;

do $$
declare
  active_duplicates integer;
  period_duplicates integer;
begin
  select count(*) into active_duplicates
  from (
    select user_id
    from public.membership_entitlement_cycles
    where is_active
    group by user_id
    having count(*) > 1
  ) duplicates;

  if active_duplicates > 0 then
    raise exception
      'membership_entitlement_cycles has % members with more than one active cycle; refusing the unique index without rewriting balances',
      active_duplicates;
  end if;

  select count(*) into period_duplicates
  from (
    select user_id
    from public.membership_entitlement_cycles
    group by user_id, public.entitlement_period_second(period_start)
    having count(*) > 1
  ) duplicates;

  if period_duplicates > 0 then
    raise exception
      'membership_entitlement_cycles has % member/period pairs with more than one cycle; refusing the unique index without rewriting balances',
      period_duplicates;
  end if;
end $$;

create unique index if not exists membership_entitlement_cycles_one_active_uidx
  on public.membership_entitlement_cycles (user_id)
  where is_active;

create unique index if not exists membership_entitlement_cycles_user_period_uidx
  on public.membership_entitlement_cycles (user_id, public.entitlement_period_second(period_start));

create or replace function public.replace_membership_entitlement_cycle(
  p_user_id uuid,
  p_product_tier text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_credits_granted integer,
  p_guest_invites_granted integer,
  p_circle_social_credits_granted integer
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  existing public.membership_entitlement_cycles;
  inserted public.membership_entitlement_cycles;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select * into existing
  from public.membership_entitlement_cycles
  where user_id = p_user_id
    and is_active
  order by created_at desc
  limit 1
  for update;

  if existing.id is not null
     and floor(extract(epoch from existing.period_start))
       >= floor(extract(epoch from p_period_start))
  then
    return to_jsonb(existing);
  end if;

  -- Insert inactive first. The old cycle stays active until the flip below.
  -- Any error aborts this transaction, so a failed renewal cannot leave the
  -- old cycle expired without its replacement.
  insert into public.membership_entitlement_cycles (
    user_id,
    product_tier,
    period_start,
    period_end,
    credits_granted,
    credits_used,
    guest_invites_granted,
    guest_invites_used,
    circle_social_credits_granted,
    circle_social_credits_used,
    is_active
  ) values (
    p_user_id,
    p_product_tier,
    p_period_start,
    p_period_end,
    p_credits_granted,
    0,
    p_guest_invites_granted,
    0,
    p_circle_social_credits_granted,
    0,
    false
  )
  returning * into inserted;

  update public.membership_entitlement_cycles
  set is_active = false
  where user_id = p_user_id
    and is_active
    and id <> inserted.id;

  update public.membership_entitlement_cycles
  set is_active = true
  where id = inserted.id
  returning * into inserted;

  return to_jsonb(inserted);
exception
  when unique_violation then
    select * into existing
    from public.membership_entitlement_cycles
    where user_id = p_user_id
      and public.entitlement_period_second(period_start)
        = public.entitlement_period_second(p_period_start)
    order by created_at
    limit 1;

    if existing.id is null then
      raise;
    end if;

    return to_jsonb(existing);
end;
$$;

revoke all on function public.entitlement_period_second(timestamptz) from public;
revoke all on function public.entitlement_period_second(timestamptz) from anon;
revoke all on function public.entitlement_period_second(timestamptz) from authenticated;
grant execute on function public.entitlement_period_second(timestamptz) to service_role;

revoke all on function public.replace_membership_entitlement_cycle(
  uuid, text, timestamptz, timestamptz, integer, integer, integer
) from public;
revoke all on function public.replace_membership_entitlement_cycle(
  uuid, text, timestamptz, timestamptz, integer, integer, integer
) from anon;
revoke all on function public.replace_membership_entitlement_cycle(
  uuid, text, timestamptz, timestamptz, integer, integer, integer
) from authenticated;

grant execute on function public.replace_membership_entitlement_cycle(
  uuid, text, timestamptz, timestamptz, integer, integer, integer
) to service_role;

comment on function public.replace_membership_entitlement_cycle(
  uuid, text, timestamptz, timestamptz, integer, integer, integer
) is
  'Service-role billing function. SECURITY INVOKER, search_path public. Opens one Circle entitlement cycle. The caller supplies the member id, grants, and period; there is no auth.uid() check. EXECUTE is granted only to service_role. Retains the active cycle when the incoming period is not newer and does not change granted or used balances on an existing row.';
