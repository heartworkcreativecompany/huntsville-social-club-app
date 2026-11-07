-- Ticket emails read the cover, event page, and greeting name from the
-- registration and event rows already stored for this outbox claim.

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
  where event_ticket_emails.id = p_id
    and event_ticket_emails.claim_token = p_claim_token
    and event_ticket_emails.status = 'processing'
    and event_ticket_emails.lease_expires_at > now();

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
      'first_name', coalesce(
        nullif(trim(profiles.given_name), ''),
        nullif(split_part(trim(coalesce(profiles.full_name, '')), ' ', 1), ''),
        'there'
      ),
      'event_id', events.id,
      'event_name', coalesce(nullif(trim(events.title), ''), 'your event'),
      'cover_image_url', nullif(trim(events.cover_image_url), ''),
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
      'first_name', coalesce(
        nullif(split_part(trim(coalesce(registrations.full_name, '')), ' ', 1), ''),
        'there'
      ),
      'event_id', events.id,
      'event_name', coalesce(nullif(trim(events.title), ''), 'your event'),
      'cover_image_url', nullif(trim(events.cover_image_url), ''),
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

revoke all on function public.load_event_ticket_email_context(uuid, uuid) from public, anon, authenticated;
grant execute on function public.load_event_ticket_email_context(uuid, uuid) to service_role;
