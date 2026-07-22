-- Membership / events / sponsorship / business directory alignment (July 2026 rules).
-- Premium credits replace legacy "standard event registration" credits.
-- Standard events are free for all members; premium credits apply to premium_event only.

-- ---------------------------------------------------------------------------
-- Events: premium type, approval status, fees, sponsorship, priority RSVP
-- ---------------------------------------------------------------------------

alter table public.events
  drop constraint if exists events_event_type_check;

alter table public.events
  add constraint events_event_type_check
  check (event_type in ('standard_event', 'circle_social', 'premium_event'));

alter table public.events
  drop constraint if exists events_status_check;

alter table public.events
  add constraint events_status_check
  check (status in ('draft', 'pending_approval', 'published', 'cancelled'));

alter table public.events
  add column if not exists fee_cents integer,
  add column if not exists sponsorship_eligible boolean not null default false,
  add column if not exists priority_rsvp_opens_at timestamptz,
  add column if not exists general_rsvp_opens_at timestamptz;

comment on column public.events.fee_cents is
  'Optional per-attendee fee in cents for Circle Socials (free members) or Premium events.';

comment on column public.events.sponsorship_eligible is
  'When true, businesses may purchase a $199 sponsorship (Circle Socials / Premium).';

-- Default: Circle Socials and Premium are sponsorship-eligible; Standard is not.
update public.events
set sponsorship_eligible = true
where event_type in ('circle_social', 'premium_event')
  and sponsorship_eligible = false;

-- ---------------------------------------------------------------------------
-- Entitlement cycles: guest invites + rename semantics (credits = premium credits)
-- ---------------------------------------------------------------------------

alter table public.membership_entitlement_cycles
  add column if not exists guest_invites_granted integer not null default 0,
  add column if not exists guest_invites_used integer not null default 0;

comment on column public.membership_entitlement_cycles.credits_granted is
  'Premium event credits granted this period (Inner=1, Elite=2). Null is legacy unlimited.';

comment on column public.membership_entitlement_cycles.guest_invites_granted is
  'Elite guest invites granted this billing period (typically 1).';

-- ---------------------------------------------------------------------------
-- Event sponsorships ($199 Checkout)
-- ---------------------------------------------------------------------------

create table if not exists public.event_sponsorships (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  sponsor_user_id uuid references public.profiles (id) on delete set null,
  business_name text not null default '',
  contact_email text,
  status text not null default 'pending_payment'
    check (status in (
      'pending_payment',
      'paid',
      'approved',
      'claimed',
      'cancelled',
      'refunded'
    )),
  amount_cents integer not null default 19900,
  ticket_count integer not null default 4,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  logo_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  approved_at timestamptz
);

create unique index if not exists event_sponsorships_one_active_per_event
  on public.event_sponsorships (event_id)
  where status in ('pending_payment', 'paid', 'approved', 'claimed');

create index if not exists event_sponsorships_event_id_idx
  on public.event_sponsorships (event_id);

alter table public.event_sponsorships enable row level security;

drop policy if exists "Members can read sponsorships for published events"
  on public.event_sponsorships;
create policy "Members can read sponsorships for published events"
  on public.event_sponsorships for select to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = event_id and e.status = 'published'
    )
    or sponsor_user_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'host')
    )
  );

drop policy if exists "Members can insert own sponsorships"
  on public.event_sponsorships;
create policy "Members can insert own sponsorships"
  on public.event_sponsorships for insert to authenticated
  with check (sponsor_user_id = auth.uid());

drop policy if exists "Sponsors and admins can update sponsorships"
  on public.event_sponsorships;
create policy "Sponsors and admins can update sponsorships"
  on public.event_sponsorships for update to authenticated
  using (
    sponsor_user_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- ---------------------------------------------------------------------------
-- Business directory listings (Elite apply; browse for all approved members)
-- ---------------------------------------------------------------------------

create table if not exists public.business_listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  business_name text not null,
  description text not null default '',
  industry text not null default '',
  category text not null default '',
  website_url text,
  contact_email text,
  phone text,
  city text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'archived')),
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  reviewed_at timestamptz
);

create index if not exists business_listings_status_industry_idx
  on public.business_listings (status, industry, category);

create index if not exists business_listings_owner_id_idx
  on public.business_listings (owner_id);

alter table public.business_listings enable row level security;

drop policy if exists "Approved listings are readable by authenticated"
  on public.business_listings;
create policy "Approved listings are readable by authenticated"
  on public.business_listings for select to authenticated
  using (
    status = 'approved'
    or owner_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists "Owners can insert business listings"
  on public.business_listings;
create policy "Owners can insert business listings"
  on public.business_listings for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "Owners and admins can update business listings"
  on public.business_listings;
create policy "Owners and admins can update business listings"
  on public.business_listings for update to authenticated
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

grant select, insert, update on public.event_sponsorships to authenticated;
grant select, insert, update on public.business_listings to authenticated;
grant all on public.event_sponsorships to service_role;
grant all on public.business_listings to service_role;

-- Paid members may create standard events that require admin approval before publish.
drop policy if exists "Paid members can insert standard events pending approval"
  on public.events;
create policy "Paid members can insert standard events pending approval"
  on public.events
  for insert
  to authenticated
  with check (
    owner_id = auth.uid()
    and event_type = 'standard_event'
    and status = 'pending_approval'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.application_status = 'approved'
        and (
          public.is_host_or_admin(auth.uid())
          or coalesce(p.membership_billing->>'tier', '') in (
            'inner_circle',
            'elite_circle',
            'premium_member',
            'community_partner'
          )
        )
    )
  );

drop policy if exists "Admins can update any event"
  on public.events;
create policy "Admins can update any event"
  on public.events
  for update
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
