-- Ticket confirmation for one confirmed RSVP.
-- Does not backfill existing rows, replay expired holds, or refund credits or fees.
--
-- event_ticket_emails follows the application_email_log lease:
-- claim_token is the lease owner, lease_expires_at is the exclusive window,
-- attempts increment only when a lease is acquired, attempt 5 is the last try,
-- and a null next_attempt_at is not due.

alter table public.event_attendees
  add column if not exists id uuid not null default gen_random_uuid();

create unique index if not exists event_attendees_id_key
  on public.event_attendees (id);

comment on column public.event_attendees.id is
  'Stable id for ticket emails. Primary key remains (event_id, user_id).';

alter table public.event_attendees
  add column if not exists confirmation_code text,
  add column if not exists confirmed_at timestamptz,
  add column if not exists admission_source text,
  add column if not exists amount_paid_cents integer;

alter table public.guest_event_registrations
  add column if not exists confirmation_code text,
  add column if not exists confirmed_at timestamptz,
  add column if not exists admission_source text,
  add column if not exists amount_paid_cents integer;

alter table public.event_attendees
  drop constraint if exists event_attendees_confirmation_code_check;

alter table public.event_attendees
  add constraint event_attendees_confirmation_code_check
  check (
    confirmation_code is null
    or confirmation_code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$'
  );

alter table public.guest_event_registrations
  drop constraint if exists guest_event_registrations_confirmation_code_check;

alter table public.guest_event_registrations
  add constraint guest_event_registrations_confirmation_code_check
  check (
    confirmation_code is null
    or confirmation_code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$'
  );

create unique index if not exists event_attendees_confirmation_code_key
  on public.event_attendees (confirmation_code);

create unique index if not exists guest_event_registrations_confirmation_code_key
  on public.guest_event_registrations (confirmation_code);

alter table public.event_attendees
  drop constraint if exists event_attendees_admission_source_check;

alter table public.event_attendees
  add constraint event_attendees_admission_source_check
  check (
    admission_source is null
    or admission_source = any (
      array[
        'paid'::text,
        'circle_social_credit'::text,
        'premium_event_credit'::text,
        'included'::text,
        'free'::text
      ]
    )
  );

alter table public.guest_event_registrations
  drop constraint if exists guest_event_registrations_admission_source_check;

alter table public.guest_event_registrations
  add constraint guest_event_registrations_admission_source_check
  check (
    admission_source is null
    or admission_source = any (
      array[
        'paid'::text,
        'circle_social_credit'::text,
        'premium_event_credit'::text,
        'included'::text,
        'free'::text
      ]
    )
  );

alter table public.event_attendees
  drop constraint if exists event_attendees_amount_paid_cents_check;

alter table public.event_attendees
  add constraint event_attendees_amount_paid_cents_check
  check (amount_paid_cents is null or amount_paid_cents >= 0);

alter table public.guest_event_registrations
  drop constraint if exists guest_event_registrations_amount_paid_cents_check;

alter table public.guest_event_registrations
  add constraint guest_event_registrations_amount_paid_cents_check
  check (amount_paid_cents is null or amount_paid_cents >= 0);

comment on column public.event_attendees.confirmation_code is
  'Shown at check-in. Generated once when the RSVP is confirmed.';

comment on column public.event_attendees.confirmed_at is
  'When this RSVP was confirmed. Null means no ticket email is due.';

comment on column public.event_attendees.admission_source is
  'paid, circle_social_credit, premium_event_credit, included, or free.';

comment on column public.event_attendees.amount_paid_cents is
  'Amount collected for this RSVP. Zero when a credit, included admission, or free admission confirmed it.';

comment on column public.guest_event_registrations.confirmation_code is
  'Shown at check-in. Generated once when the guest payment is confirmed.';

comment on column public.guest_event_registrations.confirmed_at is
  'When this guest registration was confirmed. Null means no ticket email is due.';

comment on column public.guest_event_registrations.admission_source is
  'paid for a guest Checkout payment.';

comment on column public.guest_event_registrations.amount_paid_cents is
  'Amount collected when the guest registration was confirmed.';

-- Members can update their own RSVP, but they cannot mint a ticket.
create or replace function public.preserve_event_admission_confirmation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.confirmation_code := null;
      new.confirmed_at := null;
      new.admission_source := null;
      new.amount_paid_cents := null;
    else
      new.confirmation_code := old.confirmation_code;
      new.confirmed_at := old.confirmed_at;
      new.admission_source := old.admission_source;
      new.amount_paid_cents := old.amount_paid_cents;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists preserve_event_attendee_admission_confirmation
  on public.event_attendees;
create trigger preserve_event_attendee_admission_confirmation
  before insert or update on public.event_attendees
  for each row
  execute function public.preserve_event_admission_confirmation();

drop trigger if exists preserve_guest_admission_confirmation
  on public.guest_event_registrations;
create trigger preserve_guest_admission_confirmation
  before insert or update on public.guest_event_registrations
  for each row
  execute function public.preserve_event_admission_confirmation();

revoke insert, update (
  confirmation_code,
  confirmed_at,
  admission_source,
  amount_paid_cents
) on table public.event_attendees from anon, authenticated;

revoke insert, update (
  confirmation_code,
  confirmed_at,
  admission_source,
  amount_paid_cents
) on table public.guest_event_registrations from anon, authenticated;

create table if not exists public.event_ticket_emails (
  id uuid primary key default gen_random_uuid(),
  registration_kind text not null,
  registration_id uuid not null,
  email_type text not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  claim_token uuid,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz,
  resend_message_id text,
  sent_at timestamptz,
  last_error text,
  credits_remaining integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_ticket_emails_registration_kind_check
    check (
      registration_kind = any (
        array['event_attendee'::text, 'guest_event_registration'::text]
      )
    ),
  constraint event_ticket_emails_email_type_check
    check (email_type = 'ticket_confirmation'),
  constraint event_ticket_emails_status_check
    check (
      status = any (
        array[
          'pending'::text,
          'processing'::text,
          'sent'::text,
          'failed'::text
        ]
      )
    ),
  constraint event_ticket_emails_attempts_check
    check (attempts >= 0 and attempts <= 5),
  constraint event_ticket_emails_last_error_check
    check (last_error is null or char_length(last_error) <= 200),
  constraint event_ticket_emails_credits_remaining_check
    check (credits_remaining is null or credits_remaining >= 0),
  constraint event_ticket_emails_schedule_check
    check (
      (
        status = 'pending'
        and attempts < 5
        and next_attempt_at is not null
        and claim_token is null
        and lease_expires_at is null
        and sent_at is null
      )
      or (
        status = 'processing'
        and attempts >= 1
        and attempts <= 5
        and claim_token is not null
        and lease_expires_at is not null
        and sent_at is null
      )
      or (
        status = 'sent'
        and sent_at is not null
        and resend_message_id is not null
        and next_attempt_at is null
        and claim_token is null
        and lease_expires_at is null
      )
      or (
        status = 'failed'
        and attempts >= 5
        and next_attempt_at is null
        and claim_token is null
        and lease_expires_at is null
        and sent_at is null
      )
    )
);

create unique index if not exists event_ticket_emails_registration_email_key
  on public.event_ticket_emails (registration_kind, registration_id, email_type);

create index if not exists event_ticket_emails_due_idx
  on public.event_ticket_emails (next_attempt_at, created_at)
  where status = 'pending'
    and attempts < 5
    and next_attempt_at is not null;

comment on table public.event_ticket_emails is
  'Outbox for ticket emails. One ticket_confirmation per registration. Service role writes. A Resend failure updates this row and does not change the RSVP.';

comment on column public.event_ticket_emails.lease_expires_at is
  'Exclusive send window. Same role as application_email_log.claimed_until.';

comment on column public.event_ticket_emails.next_attempt_at is
  'Explicit next run. Null means not scheduled: processing, sent, failed, or exhausted. Pending work stores a timestamp, never null.';

comment on column public.event_ticket_emails.credits_remaining is
  'Snapshot for a credit admission line. Null for paid, included, and free tickets.';

drop trigger if exists set_event_ticket_emails_updated_at
  on public.event_ticket_emails;
create trigger set_event_ticket_emails_updated_at
  before update on public.event_ticket_emails
  for each row
  execute function public.set_updated_at();

alter table public.event_ticket_emails enable row level security;

revoke all on table public.event_ticket_emails from anon, authenticated;
grant all on table public.event_ticket_emails to service_role;

create or replace function public.generate_event_confirmation_code()
returns text
language plpgsql
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text := '';
  index integer;
begin
  for index in 1..8 loop
    code := code || substr(
      alphabet,
      1 + floor(random() * length(alphabet))::integer,
      1
    );
  end loop;
  return code;
end;
$$;

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
  registration_id uuid;
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
    where event_id = p_event_id
      and user_id = p_user_id
    for update;

    if not found then
      return jsonb_build_object('ok', false, 'error', 'registration_not_found');
    end if;

    registration_id := attendee.id;

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
          payment_status = coalesce(p_payment_status, payment_status),
          confirmation_code = coalesce(confirmation_code, new_code),
          confirmed_at = coalesce(confirmed_at, now()),
          admission_source = coalesce(admission_source, p_admission_source),
          amount_paid_cents = coalesce(amount_paid_cents, paid_amount)
        where event_id = p_event_id
          and user_id = p_user_id
          and confirmed_at is null
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
      into existing_code, registration_id
      from public.event_attendees as attendees
      where attendees.event_id = p_event_id
        and attendees.user_id = p_user_id;

      select emails.id
      into outbox_id
      from public.event_ticket_emails as emails
      where emails.registration_kind = 'event_attendee'
        and emails.registration_id = registration_id
        and emails.email_type = 'ticket_confirmation';

      return jsonb_build_object(
        'ok', true,
        'already_confirmed', true,
        'confirmation_code', existing_code,
        'outbox_id', outbox_id,
        'registration_id', registration_id
      );
    end if;

    registration_id := confirmed_attendee.id;
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
    where id = p_registration_id
    for update;

    if not found then
      return jsonb_build_object('ok', false, 'error', 'registration_not_found');
    end if;

    if guest.event_id is distinct from p_event_id then
      return jsonb_build_object('ok', false, 'error', 'registration_not_found');
    end if;

    registration_id := guest.id;

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
          confirmation_code = coalesce(confirmation_code, new_code),
          confirmed_at = coalesce(confirmed_at, now()),
          admission_source = coalesce(admission_source, 'paid'),
          amount_paid_cents = coalesce(amount_paid_cents, paid_amount)
        where id = p_registration_id
          and event_id = p_event_id
          and status = 'paid'
          and confirmed_at is null
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

    registration_id := confirmed_guest.id;
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
    registration_id,
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
      and emails.registration_id = registration_id
      and emails.email_type = 'ticket_confirmation';
  end if;

  return jsonb_build_object(
    'ok', true,
    'already_confirmed', false,
    'confirmation_code', existing_code,
    'outbox_id', outbox_id,
    'registration_id', registration_id
  );
end;
$$;

create or replace function public.claim_event_ticket_email(
  p_id uuid,
  p_lease_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  chosen uuid;
  updated public.event_ticket_emails;
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'forbidden'
      using errcode = '42501';
  end if;

  if p_lease_seconds is null or p_lease_seconds <= 0 or p_lease_seconds > 120 then
    raise exception 'invalid lease'
      using errcode = '22023';
  end if;

  select emails.id
  into chosen
  from public.event_ticket_emails as emails
  where emails.id = p_id
    and emails.attempts < 5
    and (
      (
        emails.status = 'pending'
        and emails.next_attempt_at is not null
        and emails.next_attempt_at <= now()
      )
      or (
        emails.status = 'processing'
        and emails.lease_expires_at is not null
        and emails.lease_expires_at <= now()
      )
    )
  for update skip locked;

  if chosen is null then
    return jsonb_build_object('row', null);
  end if;

  update public.event_ticket_emails
  set
    status = 'processing',
    claim_token = gen_random_uuid(),
    lease_expires_at = now() + make_interval(secs => p_lease_seconds),
    attempts = attempts + 1,
    next_attempt_at = case
      when attempts + 1 >= 5 then null
      else next_attempt_at
    end
  where id = chosen
    and attempts < 5
    and (
      (
        status = 'pending'
        and next_attempt_at is not null
        and next_attempt_at <= now()
      )
      or (
        status = 'processing'
        and lease_expires_at is not null
        and lease_expires_at <= now()
      )
    )
  returning * into updated;

  if not found then
    return jsonb_build_object('row', null);
  end if;

  return jsonb_build_object(
    'row',
    jsonb_build_object(
      'id', updated.id,
      'claim_token', updated.claim_token,
      'attempts', updated.attempts,
      'lease_expires_at', updated.lease_expires_at,
      'credits_remaining', updated.credits_remaining,
      'registration_kind', updated.registration_kind,
      'registration_id', updated.registration_id,
      'status', updated.status
    )
  );
end;
$$;

create or replace function public.finish_event_ticket_email(
  p_id uuid,
  p_claim_token uuid,
  p_succeeded boolean,
  p_resend_message_id text,
  p_last_error text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.event_ticket_emails;
  updated_id uuid;
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'forbidden'
      using errcode = '42501';
  end if;

  if p_id is null or p_claim_token is null or p_succeeded is null then
    return jsonb_build_object('ok', false);
  end if;

  if p_last_error is not null and char_length(p_last_error) > 200 then
    return jsonb_build_object('ok', false);
  end if;

  select *
  into current_row
  from public.event_ticket_emails
  where id = p_id
    and status = 'processing'
    and claim_token = p_claim_token
    and lease_expires_at > now()
  for update;

  if not found then
    return jsonb_build_object('ok', false);
  end if;

  if p_succeeded then
    if p_resend_message_id is null or length(trim(p_resend_message_id)) = 0 then
      return jsonb_build_object('ok', false);
    end if;

    update public.event_ticket_emails
    set
      status = 'sent',
      resend_message_id = p_resend_message_id,
      sent_at = now(),
      last_error = null,
      claim_token = null,
      lease_expires_at = null,
      next_attempt_at = null
    where id = p_id
      and claim_token = p_claim_token
      and status = 'processing'
      and lease_expires_at > now()
    returning id into updated_id;
  else
    update public.event_ticket_emails
    set
      status = case when attempts >= 5 then 'failed' else 'pending' end,
      last_error = coalesce(p_last_error, 'ticket_send_failed'),
      claim_token = null,
      lease_expires_at = null,
      next_attempt_at = case when attempts >= 5 then null else now() end,
      resend_message_id = null,
      sent_at = null
    where id = p_id
      and claim_token = p_claim_token
      and status = 'processing'
      and lease_expires_at > now()
    returning id into updated_id;
  end if;

  return jsonb_build_object('ok', updated_id is not null);
end;
$$;

create or replace function public.load_event_ticket_email_context(
  p_id uuid,
  p_claim_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  mail public.event_ticket_emails;
  context jsonb;
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'forbidden'
      using errcode = '42501';
  end if;

  select *
  into mail
  from public.event_ticket_emails
  where id = p_id
    and claim_token = p_claim_token
    and status = 'processing'
    and lease_expires_at > now();

  if not found then
    return jsonb_build_object('context', null);
  end if;

  if mail.registration_kind = 'event_attendee' then
    select jsonb_build_object(
      'to', profiles.email,
      'attendee_name', coalesce(
        nullif(trim(profiles.full_name), ''),
        nullif(trim(profiles.given_name), ''),
        'Member'
      ),
      'event_name', coalesce(nullif(trim(events.title), ''), 'your event'),
      'starts_at', events.starts_at,
      'ends_at', events.ends_at,
      'venue', events.location,
      'confirmation_code', attendees.confirmation_code,
      'admission_source', attendees.admission_source,
      'amount_paid_cents', attendees.amount_paid_cents,
      'credits_remaining', mail.credits_remaining
    )
    into context
    from public.event_attendees as attendees
    join public.events as events on events.id = attendees.event_id
    join public.profiles as profiles on profiles.id = attendees.user_id
    where attendees.id = mail.registration_id;
  else
    select jsonb_build_object(
      'to', registrations.email,
      'attendee_name', coalesce(nullif(trim(registrations.full_name), ''), 'Guest'),
      'event_name', coalesce(nullif(trim(events.title), ''), 'your event'),
      'starts_at', events.starts_at,
      'ends_at', events.ends_at,
      'venue', events.location,
      'confirmation_code', registrations.confirmation_code,
      'admission_source', registrations.admission_source,
      'amount_paid_cents', registrations.amount_paid_cents,
      'credits_remaining', mail.credits_remaining
    )
    into context
    from public.guest_event_registrations as registrations
    join public.events as events on events.id = registrations.event_id
    where registrations.id = mail.registration_id;
  end if;

  return jsonb_build_object('context', context);
end;
$$;

revoke all on function public.generate_event_confirmation_code() from public, anon, authenticated;
revoke all on function public.confirm_event_admission(text, uuid, uuid, uuid, text, integer, text, integer) from public, anon, authenticated;
revoke all on function public.claim_event_ticket_email(uuid, integer) from public, anon, authenticated;
revoke all on function public.finish_event_ticket_email(uuid, uuid, boolean, text, text) from public, anon, authenticated;
revoke all on function public.load_event_ticket_email_context(uuid, uuid) from public, anon, authenticated;

grant execute on function public.generate_event_confirmation_code() to service_role;
grant execute on function public.confirm_event_admission(text, uuid, uuid, uuid, text, integer, text, integer) to service_role;
grant execute on function public.claim_event_ticket_email(uuid, integer) to service_role;
grant execute on function public.finish_event_ticket_email(uuid, uuid, boolean, text, text) to service_role;
grant execute on function public.load_event_ticket_email_context(uuid, uuid) to service_role;
