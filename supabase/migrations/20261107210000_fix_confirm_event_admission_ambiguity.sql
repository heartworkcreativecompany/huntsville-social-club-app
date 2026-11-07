-- confirm_event_admission raised 42702 column reference "registration_id" is
-- ambiguous. The PL/pgSQL variable shared that name with event_ticket_emails.
-- Column references stay table-qualified. No #variable_conflict.
--
-- claim_event_ticket_email, finish_event_ticket_email,
-- load_event_ticket_email_context, and preserve_event_admission_confirmation
-- do not declare a variable with the same name as a column those statements use.

create or replace function public.confirm_event_admission(
  p_registration_kind text,
  p_event_id uuid,
  p_user_id uuid,
  p_registration_id uuid,
  p_admission_source text,
  p_amount_paid_cents integer,
  p_payment_status text,
  p_credits_remaining integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  attendee public.event_attendees;
  guest public.guest_event_registrations;
  confirmed_attendee public.event_attendees;
  confirmed_guest public.guest_event_registrations;
  v_registration_id uuid;
  existing_code text;
  new_code text;
  paid_amount integer;
  credits_snapshot integer;
  outbox_id uuid;
  attempt integer;
  did_confirm boolean := false;
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'forbidden'
      using errcode = '42501';
  end if;

  if p_registration_kind is null
    or p_registration_kind not in ('event_attendee', 'guest_event_registration') then
    raise exception 'invalid registration kind'
      using errcode = '22023';
  end if;

  if p_admission_source is null
    or p_admission_source not in (
      'paid',
      'circle_social_credit',
      'premium_event_credit',
      'included',
      'free'
    ) then
    raise exception 'invalid admission source'
      using errcode = '22023';
  end if;

  if p_payment_status is not null
    and p_payment_status not in ('paid', 'waived', 'not_required') then
    raise exception 'invalid payment status'
      using errcode = '22023';
  end if;

  if p_amount_paid_cents is not null and p_amount_paid_cents < 0 then
    raise exception 'invalid amount'
      using errcode = '22023';
  end if;

  if p_admission_source in ('circle_social_credit', 'premium_event_credit') then
    credits_snapshot := greatest(coalesce(p_credits_remaining, 0), 0);
  else
    credits_snapshot := null;
  end if;

  if p_registration_kind = 'event_attendee' then
    if p_event_id is null or p_user_id is null then
      return jsonb_build_object('ok', false, 'error', 'registration_not_found');
    end if;
    if p_amount_paid_cents is null then
      raise exception 'invalid amount'
        using errcode = '22023';
    end if;

    select *
    into attendee
    from public.event_attendees
    where event_attendees.event_id = p_event_id
      and event_attendees.user_id = p_user_id
    for update;

    if not found then
      return jsonb_build_object('ok', false, 'error', 'registration_not_found');
    end if;

    v_registration_id := attendee.id;

    if attendee.confirmed_at is not null then
      select emails.id
      into outbox_id
      from public.event_ticket_emails as emails
      where emails.registration_kind = 'event_attendee'
        and emails.registration_id = attendee.id
        and emails.email_type = 'ticket_confirmation';

      return jsonb_build_object(
        'ok', true,
        'already_confirmed', true,
        'confirmation_code', attendee.confirmation_code,
        'outbox_id', outbox_id,
        'registration_id', attendee.id
      );
    end if;

    if attendee.status is distinct from 'going'
      or attendee.payment_status = 'pending' then
      return jsonb_build_object('ok', false, 'error', 'not_confirmed');
    end if;

    paid_amount := p_amount_paid_cents;
    existing_code := attendee.confirmation_code;

    for attempt in 1..5 loop
      new_code := coalesce(existing_code, public.generate_event_confirmation_code());
      begin
        update public.event_attendees
        set
          status = 'going',
          payment_status = coalesce(p_payment_status, event_attendees.payment_status),
          confirmation_code = coalesce(event_attendees.confirmation_code, new_code),
          confirmed_at = coalesce(event_attendees.confirmed_at, now()),
          admission_source = coalesce(event_attendees.admission_source, p_admission_source),
          amount_paid_cents = coalesce(event_attendees.amount_paid_cents, paid_amount)
        where event_attendees.event_id = p_event_id
          and event_attendees.user_id = p_user_id
          and event_attendees.confirmed_at is null
        returning * into confirmed_attendee;

        did_confirm := found;
        exit;
      exception
        when unique_violation then
          if attempt = 5 then
            raise;
          end if;
      end;
    end loop;

    if not did_confirm then
      select attendees.confirmation_code, attendees.id
      into existing_code, v_registration_id
      from public.event_attendees as attendees
      where attendees.event_id = p_event_id
        and attendees.user_id = p_user_id;

      select emails.id
      into outbox_id
      from public.event_ticket_emails as emails
      where emails.registration_kind = 'event_attendee'
        and emails.registration_id = v_registration_id
        and emails.email_type = 'ticket_confirmation';

      return jsonb_build_object(
        'ok', true,
        'already_confirmed', true,
        'confirmation_code', existing_code,
        'outbox_id', outbox_id,
        'registration_id', v_registration_id
      );
    end if;

    v_registration_id := confirmed_attendee.id;
    existing_code := confirmed_attendee.confirmation_code;
  else
    if p_registration_id is null or p_event_id is null then
      return jsonb_build_object('ok', false, 'error', 'registration_not_found');
    end if;
    if p_admission_source is distinct from 'paid' then
      return jsonb_build_object('ok', false, 'error', 'invalid_admission_source');
    end if;

    select *
    into guest
    from public.guest_event_registrations
    where guest_event_registrations.id = p_registration_id
    for update;

    if not found then
      return jsonb_build_object('ok', false, 'error', 'registration_not_found');
    end if;

    if guest.event_id is distinct from p_event_id then
      return jsonb_build_object('ok', false, 'error', 'registration_not_found');
    end if;

    v_registration_id := guest.id;

    if guest.confirmed_at is not null then
      select emails.id
      into outbox_id
      from public.event_ticket_emails as emails
      where emails.registration_kind = 'guest_event_registration'
        and emails.registration_id = guest.id
        and emails.email_type = 'ticket_confirmation';

      return jsonb_build_object(
        'ok', true,
        'already_confirmed', true,
        'confirmation_code', guest.confirmation_code,
        'outbox_id', outbox_id,
        'registration_id', guest.id
      );
    end if;

    if guest.status is distinct from 'paid' then
      return jsonb_build_object('ok', false, 'error', 'not_confirmed');
    end if;

    paid_amount := guest.amount_cents;
    existing_code := guest.confirmation_code;

    did_confirm := false;
    for attempt in 1..5 loop
      new_code := coalesce(existing_code, public.generate_event_confirmation_code());
      begin
        update public.guest_event_registrations
        set
          status = 'paid',
          confirmation_code = coalesce(guest_event_registrations.confirmation_code, new_code),
          confirmed_at = coalesce(guest_event_registrations.confirmed_at, now()),
          admission_source = coalesce(guest_event_registrations.admission_source, 'paid'),
          amount_paid_cents = coalesce(guest_event_registrations.amount_paid_cents, paid_amount)
        where guest_event_registrations.id = p_registration_id
          and guest_event_registrations.event_id = p_event_id
          and guest_event_registrations.status = 'paid'
          and guest_event_registrations.confirmed_at is null
        returning * into confirmed_guest;

        did_confirm := found;
        exit;
      exception
        when unique_violation then
          if attempt = 5 then
            raise;
          end if;
      end;
    end loop;

    if not did_confirm then
      select registrations.confirmation_code
      into existing_code
      from public.guest_event_registrations as registrations
      where registrations.id = p_registration_id;

      select emails.id
      into outbox_id
      from public.event_ticket_emails as emails
      where emails.registration_kind = 'guest_event_registration'
        and emails.registration_id = p_registration_id
        and emails.email_type = 'ticket_confirmation';

      return jsonb_build_object(
        'ok', true,
        'already_confirmed', true,
        'confirmation_code', existing_code,
        'outbox_id', outbox_id,
        'registration_id', p_registration_id
      );
    end if;

    v_registration_id := confirmed_guest.id;
    existing_code := confirmed_guest.confirmation_code;
  end if;

  insert into public.event_ticket_emails (
    registration_kind,
    registration_id,
    email_type,
    status,
    attempts,
    next_attempt_at,
    credits_remaining
  )
  values (
    p_registration_kind,
    v_registration_id,
    'ticket_confirmation',
    'pending',
    0,
    now(),
    credits_snapshot
  )
  on conflict (registration_kind, registration_id, email_type) do nothing
  returning id into outbox_id;

  if outbox_id is null then
    select emails.id
    into outbox_id
    from public.event_ticket_emails as emails
    where emails.registration_kind = p_registration_kind
      and emails.registration_id = v_registration_id
      and emails.email_type = 'ticket_confirmation';
  end if;

  return jsonb_build_object(
    'ok', true,
    'already_confirmed', false,
    'confirmation_code', existing_code,
    'outbox_id', outbox_id,
    'registration_id', v_registration_id
  );
end;
$$;

revoke all on function public.confirm_event_admission(text, uuid, uuid, uuid, text, integer, text, integer) from public, anon, authenticated;
grant execute on function public.confirm_event_admission(text, uuid, uuid, uuid, text, integer, text, integer) to service_role;
