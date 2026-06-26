-- Membership tiers, event types, entitlement cycles, and registration metadata.

-- ---------------------------------------------------------------------------
-- Event access types
-- ---------------------------------------------------------------------------
alter table public.events
  add column if not exists event_type text not null default 'standard_event';

alter table public.events
  drop constraint if exists events_event_type_check;

alter table public.events
  add constraint events_event_type_check
  check (event_type = any (array['standard_event'::text, 'circle_social'::text]));

comment on column public.events.event_type is
  'standard_event = general club event; circle_social = paid-member-only category';

-- ---------------------------------------------------------------------------
-- RSVP / registration metadata
-- ---------------------------------------------------------------------------
alter table public.event_attendees
  add column if not exists registration_method text,
  add column if not exists payment_status text,
  add column if not exists entitlement_cycle_id uuid,
  add column if not exists credit_consumed boolean not null default false,
  add column if not exists registered_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists credit_returned boolean not null default false;

alter table public.event_attendees
  drop constraint if exists event_attendees_registration_method_check;

alter table public.event_attendees
  add constraint event_attendees_registration_method_check
  check (
    registration_method is null
    or registration_method = any (
      array[
        'paid_per_event'::text,
        'credit'::text,
        'included_unlimited'::text
      ]
    )
  );

alter table public.event_attendees
  drop constraint if exists event_attendees_payment_status_check;

alter table public.event_attendees
  add constraint event_attendees_payment_status_check
  check (
    payment_status is null
    or payment_status = any (
      array['pending'::text, 'paid'::text, 'waived'::text, 'not_required'::text]
    )
  );

-- Align RSVP status with app (maybe vs interested)
alter table public.event_attendees
  drop constraint if exists event_attendees_status_check;

alter table public.event_attendees
  add constraint event_attendees_status_check
  check (
    status = any (
      array['going'::text, 'maybe'::text, 'interested'::text, 'not_going'::text]
    )
  );

-- ---------------------------------------------------------------------------
-- Billing-period credit ledger (Inner Circle)
-- ---------------------------------------------------------------------------
create table if not exists public.membership_entitlement_cycles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  product_tier text not null
    check (product_tier = any (array['inner_circle'::text, 'elite_circle'::text])),
  period_start timestamptz not null,
  period_end timestamptz not null,
  credits_granted integer,
  credits_used integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint membership_entitlement_cycles_credits_nonneg
    check (credits_used >= 0),
  constraint membership_entitlement_cycles_inner_credits
    check (
      product_tier <> 'inner_circle'
      or (credits_granted is not null and credits_granted >= 0)
    )
);

create index if not exists membership_entitlement_cycles_user_active_idx
  on public.membership_entitlement_cycles (user_id)
  where is_active = true;

alter table public.membership_entitlement_cycles enable row level security;

create policy "Members read own entitlement cycles"
  on public.membership_entitlement_cycles
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_admin((select auth.uid()))
  );

alter table public.event_attendees
  drop constraint if exists event_attendees_entitlement_cycle_id_fkey;

alter table public.event_attendees
  add constraint event_attendees_entitlement_cycle_id_fkey
  foreign key (entitlement_cycle_id)
  references public.membership_entitlement_cycles (id)
  on delete set null;

-- ---------------------------------------------------------------------------
-- Registration audit ledger
-- ---------------------------------------------------------------------------
create table if not exists public.event_registration_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  action text not null
    check (
      action = any (
        array[
          'register'::text,
          'cancel'::text,
          'credit_consume'::text,
          'credit_return'::text,
          'payment_required'::text,
          'payment_complete'::text
        ]
      )
    ),
  registration_method text,
  entitlement_cycle_id uuid references public.membership_entitlement_cycles (id) on delete set null,
  credit_delta integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists event_registration_ledger_user_idx
  on public.event_registration_ledger (user_id, created_at desc);

alter table public.event_registration_ledger enable row level security;

create policy "Members read own registration ledger"
  on public.event_registration_ledger
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_admin((select auth.uid()))
  );
