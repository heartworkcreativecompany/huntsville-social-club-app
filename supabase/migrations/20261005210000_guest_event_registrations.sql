-- Paid guest (non-member) RSVPs. Separate from member attendance, credits, and entitlements.
-- Writes are service-role only. Authenticated users may only select rows this policy allows.

create table public.guest_event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  full_name text not null,
  email text not null,
  status text not null default 'pending_payment',
  amount_cents integer not null,
  currency text not null default 'usd',
  rsvp_answer text,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  expires_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guest_event_registrations_full_name_length
    check (char_length(full_name) between 1 and 120),
  constraint guest_event_registrations_email_normalized
    check (email = lower(trim(email))),
  constraint guest_event_registrations_status_check
    check (
      status = any (
        array[
          'pending_payment'::text,
          'paid'::text,
          'cancelled'::text,
          'expired'::text,
          'refunded'::text
        ]
      )
    ),
  constraint guest_event_registrations_amount_positive
    check (amount_cents > 0),
  constraint guest_event_registrations_rsvp_answer_max_length
    check (rsvp_answer is null or char_length(rsvp_answer) <= 300)
);

comment on table public.guest_event_registrations is
  'Private paid guest RSVPs. Not member attendance, credits, or entitlements. Service role writes; admins and the event owner may read.';

comment on column public.guest_event_registrations.email is
  'Stored lowercase and trimmed. One active pending or paid registration per event.';

comment on column public.guest_event_registrations.expires_at is
  'When a pending checkout stops holding a spot.';

comment on column public.guest_event_registrations.rsvp_answer is
  'Optional guest answer. Same 300-character limit as events.rsvp_question.';

create index guest_event_registrations_event_id_idx
  on public.guest_event_registrations (event_id);

create unique index guest_event_registrations_one_active_email_per_event
  on public.guest_event_registrations (event_id, email)
  where status in ('pending_payment', 'paid');

drop trigger if exists set_guest_event_registrations_updated_at
  on public.guest_event_registrations;
create trigger set_guest_event_registrations_updated_at
  before update on public.guest_event_registrations
  for each row
  execute function public.set_updated_at();

alter table public.guest_event_registrations enable row level security;

drop policy if exists "Admins and event owners can read guest registrations"
  on public.guest_event_registrations;
create policy "Admins and event owners can read guest registrations"
  on public.guest_event_registrations
  for select
  to authenticated
  using (
    public.is_admin((select auth.uid()))
    or exists (
      select 1
      from public.events
      where events.id = guest_event_registrations.event_id
        and events.owner_id = (select auth.uid())
    )
  );

revoke all on table public.guest_event_registrations from anon, authenticated;
grant select on table public.guest_event_registrations to authenticated;
grant all on table public.guest_event_registrations to service_role;
