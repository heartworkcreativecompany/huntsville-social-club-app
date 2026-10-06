-- Atomic guest seat holds for publicly listed paid events.
-- Returns only a result code plus the new registration id and amount.
-- Does not write member attendance, credits, or entitlement cycles.

create or replace function public.event_taken_seat_count(p_event_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select (
    (
      select count(*)::integer
      from public.event_attendees
      where event_id = p_event_id
        and status = 'going'
        and payment_status is distinct from 'pending'
    )
    +
    (
      select count(*)::integer
      from public.guest_event_registrations
      where event_id = p_event_id
        and (
          status = 'paid'
          or (
            status = 'pending_payment'
            and expires_at > now()
          )
        )
    )
  );
$$;

create or replace function public.reserve_guest_event_seat(
  p_event_id uuid,
  p_full_name text,
  p_email text,
  p_rsvp_answer text,
  p_hold_minutes integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_email text;
  v_name text;
  v_answer text;
  v_hold integer;
  v_taken integer;
  v_recent integer;
  v_id uuid;
begin
  v_name := trim(coalesce(p_full_name, ''));
  v_email := lower(trim(coalesce(p_email, '')));
  v_answer := nullif(trim(coalesce(p_rsvp_answer, '')), '');
  v_hold := coalesce(p_hold_minutes, 30);
  if v_hold < 1 then
    v_hold := 30;
  end if;

  if char_length(v_name) < 1
     or char_length(v_name) > 120
     or char_length(v_email) > 320
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or (v_answer is not null and char_length(v_answer) > 300) then
    return jsonb_build_object('code', 'invalid_input');
  end if;

  select *
  into v_event
  from public.events
  where id = p_event_id
  for update;

  if not found
     or v_event.status is distinct from 'published'
     or v_event.listed_publicly is not true
     or v_event.starts_at is null
     or v_event.starts_at <= now()
     or coalesce(v_event.fee_cents, 0) <= 0
     or (
       v_event.general_rsvp_opens_at is not null
       and v_event.general_rsvp_opens_at > now()
     ) then
    return jsonb_build_object('code', 'not_available');
  end if;

  update public.guest_event_registrations
  set status = 'expired'
  where event_id = p_event_id
    and status = 'pending_payment'
    and expires_at <= now();

  if exists (
    select 1
    from public.guest_event_registrations
    where event_id = p_event_id
      and email = v_email
      and status in ('pending_payment', 'paid')
  ) then
    return jsonb_build_object('code', 'already_registered');
  end if;

  select count(*)::integer
  into v_recent
  from public.guest_event_registrations
  where email = v_email
    and created_at > now() - interval '1 hour';

  if v_recent >= 5 then
    return jsonb_build_object('code', 'rate_limited');
  end if;

  v_taken := public.event_taken_seat_count(p_event_id);

  if v_event.attendance_max is not null and v_taken >= v_event.attendance_max then
    return jsonb_build_object('code', 'full');
  end if;

  insert into public.guest_event_registrations (
    event_id,
    full_name,
    email,
    status,
    amount_cents,
    currency,
    rsvp_answer,
    expires_at
  )
  values (
    p_event_id,
    v_name,
    v_email,
    'pending_payment',
    v_event.fee_cents,
    'usd',
    v_answer,
    now() + make_interval(mins => v_hold)
  )
  returning id into v_id;

  return jsonb_build_object(
    'code', 'ok',
    'id', v_id,
    'amount_cents', v_event.fee_cents
  );
end;
$$;

revoke all on function public.event_taken_seat_count(uuid) from public;
revoke all on function public.event_taken_seat_count(uuid) from anon;
revoke all on function public.event_taken_seat_count(uuid) from authenticated;
grant execute on function public.event_taken_seat_count(uuid) to service_role;

revoke all on function public.reserve_guest_event_seat(uuid, text, text, text, integer) from public;
revoke all on function public.reserve_guest_event_seat(uuid, text, text, text, integer) from anon;
revoke all on function public.reserve_guest_event_seat(uuid, text, text, text, integer) from authenticated;
grant execute on function public.reserve_guest_event_seat(uuid, text, text, text, integer) to service_role;
