-- Paid messaging is required to read or send member conversations.
-- Admin moderation (is_admin) stays separate from a member's personal entitlement.
-- Curated-intro participation does not grant access.
-- community_partner is not a messaging tier.
-- Grace does not grant messaging, including a historical paid tier or stored
-- price from incomplete, paused, or a manually assigned grace status.
-- Active, unrevoked, unexpired Inner Circle or Elite Circle complimentary
-- overrides are the explicit exception and do grant messaging.
-- Live price IDs match lib/stripe/config.ts STRIPE_LIVE_PRICE_IDS.

create or replace function public.profile_billing_has_paid_messaging(billing jsonb)
returns boolean
language plpgsql
stable
as $$
declare
  tier text;
  status text;
  price_id text;
  period_end timestamptz;
  cancel_at_end boolean;
begin
  if billing is null or jsonb_typeof(billing) <> 'object' then
    return false;
  end if;

  tier := billing->>'tier';
  status := coalesce(billing->>'subscription_status', 'none');
  price_id := billing->>'stripe_price_id';
  cancel_at_end := coalesce((billing->>'cancel_at_period_end')::boolean, false);

  if cancel_at_end and nullif(billing->>'billing_period_end', '') is not null then
    period_end := (billing->>'billing_period_end')::timestamptz;
    if period_end <= now() then
      return false;
    end if;
  end if;

  if status = 'active'
     and tier in ('connect', 'inner_circle', 'elite_circle', 'premium_member') then
    return true;
  end if;

  -- Stale tier "member" with a mapped active price still entitles.
  -- Grace does not, even when a historical paid tier or price remains stored.
  if status = 'active'
     and price_id in (
       'price_1UCjKABei7W40myB2Mnqrtse',
       'price_1TqimnBei7W40myBUKESC7wF',
       'price_1TqimyBei7W40myBRnke6fQF'
     ) then
    return true;
  end if;

  return false;
end;
$$;

create or replace function public.member_has_paid_messaging(check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.membership_access_overrides o
      where o.user_id = check_user_id
        and o.revoked_at is null
        and o.starts_at <= now()
        and (o.expires_at is null or o.expires_at > now())
        and o.tier in ('connect', 'inner_circle', 'elite_circle')
    )
    or exists (
      select 1
      from public.profiles p
      where p.id = check_user_id
        and public.profile_billing_has_paid_messaging(p.membership_billing)
    );
$$;

revoke all on function public.profile_billing_has_paid_messaging(jsonb) from public;
revoke all on function public.member_has_paid_messaging(uuid) from public;
grant execute on function public.profile_billing_has_paid_messaging(jsonb) to authenticated;
grant execute on function public.member_has_paid_messaging(uuid) to authenticated;

drop policy if exists "Participants read conversations" on public.member_conversations;
create policy "Participants read conversations"
  on public.member_conversations
  for select
  to authenticated
  using (
    public.is_admin((select auth.uid()))
    or (
      public.member_has_paid_messaging((select auth.uid()))
      and (
        participant_a = (select auth.uid())
        or participant_b = (select auth.uid())
      )
    )
  );

drop policy if exists "Participants update conversations" on public.member_conversations;
create policy "Participants update conversations"
  on public.member_conversations
  for update
  to authenticated
  using (
    public.member_has_paid_messaging((select auth.uid()))
    and (
      participant_a = (select auth.uid())
      or participant_b = (select auth.uid())
    )
  )
  with check (
    public.member_has_paid_messaging((select auth.uid()))
    and (
      participant_a = (select auth.uid())
      or participant_b = (select auth.uid())
    )
  );

drop policy if exists "Participants read messages" on public.member_messages;
create policy "Participants read messages"
  on public.member_messages
  for select
  to authenticated
  using (
    public.is_admin((select auth.uid()))
    or (
      public.member_has_paid_messaging((select auth.uid()))
      and exists (
        select 1
        from public.member_conversations c
        where c.id = conversation_id
          and (
            c.participant_a = (select auth.uid())
            or c.participant_b = (select auth.uid())
          )
      )
    )
  );

drop policy if exists "Participants send messages" on public.member_messages;
create policy "Participants send messages"
  on public.member_messages
  for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and public.member_has_paid_messaging((select auth.uid()))
    and exists (
      select 1
      from public.member_conversations c
      where c.id = conversation_id
        and c.status = 'accepted'
        and (
          c.participant_a = (select auth.uid())
          or c.participant_b = (select auth.uid())
        )
    )
  );

drop policy if exists "Recipients mark messages read" on public.member_messages;
create policy "Recipients mark messages read"
  on public.member_messages
  for update
  to authenticated
  using (
    sender_id <> (select auth.uid())
    and public.member_has_paid_messaging((select auth.uid()))
    and exists (
      select 1
      from public.member_conversations c
      where c.id = conversation_id
        and (
          c.participant_a = (select auth.uid())
          or c.participant_b = (select auth.uid())
        )
    )
  )
  with check (
    sender_id <> (select auth.uid())
    and public.member_has_paid_messaging((select auth.uid()))
    and exists (
      select 1
      from public.member_conversations c
      where c.id = conversation_id
        and (
          c.participant_a = (select auth.uid())
          or c.participant_b = (select auth.uid())
        )
    )
  );

-- Older Stripe events must not overwrite a newer membership_billing snapshot.
create or replace function public.apply_membership_billing_sync(
  p_user_id uuid,
  p_billing jsonb,
  p_event_created bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_billing jsonb;
  current_created bigint;
  current_status text;
  incoming_status text;
begin
  select membership_billing
  into current_billing
  from public.profiles
  where id = p_user_id
  for update;

  if current_billing is null then
    current_billing := '{}'::jsonb;
  end if;

  current_created := nullif(current_billing->>'stripe_event_created', '')::bigint;
  current_status := coalesce(current_billing->>'subscription_status', 'none');
  incoming_status := coalesce(p_billing->>'subscription_status', 'none');

  if current_created is not null and p_event_created < current_created then
    return current_billing;
  end if;

  if current_created is not null
     and p_event_created = current_created
     and current_status = 'cancelled'
     and incoming_status <> 'cancelled' then
    return current_billing;
  end if;

  update public.profiles
  set
    membership_billing = p_billing,
    updated_at = now()
  where id = p_user_id;

  return p_billing;
end;
$$;

revoke all on function public.apply_membership_billing_sync(uuid, jsonb, bigint) from public;
grant execute on function public.apply_membership_billing_sync(uuid, jsonb, bigint) to service_role;
