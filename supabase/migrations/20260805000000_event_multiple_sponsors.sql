-- Allow multiple sponsors per Circle Social / Premium event via a join table.
-- Reuses purchase rows in event_sponsorships; display assignment lives on event_sponsors.

-- ---------------------------------------------------------------------------
-- Sponsors (reusable entities)
-- ---------------------------------------------------------------------------

create table if not exists public.sponsors (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  contact_email text,
  logo_url text,
  website_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sponsors_business_name_lower_idx
  on public.sponsors (lower(trim(business_name)));

alter table public.sponsors enable row level security;

drop policy if exists "Authenticated members can read sponsors"
  on public.sponsors;
create policy "Authenticated members can read sponsors"
  on public.sponsors for select to authenticated
  using (true);

drop policy if exists "Admins can insert sponsors"
  on public.sponsors;
drop policy if exists "Authenticated members can insert sponsors"
  on public.sponsors;
create policy "Authenticated members can insert sponsors"
  on public.sponsors for insert to authenticated
  with check (true);

drop policy if exists "Admins can update sponsors"
  on public.sponsors;
create policy "Admins can update sponsors"
  on public.sponsors for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists "Admins can delete sponsors"
  on public.sponsors;
create policy "Admins can delete sponsors"
  on public.sponsors for delete to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- ---------------------------------------------------------------------------
-- Event ↔ sponsor join (many-to-many) with display order
-- ---------------------------------------------------------------------------

create table if not exists public.event_sponsors (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  sponsor_id uuid not null references public.sponsors (id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (event_id, sponsor_id)
);

create index if not exists event_sponsors_event_id_sort_idx
  on public.event_sponsors (event_id, sort_order, created_at);

create index if not exists event_sponsors_sponsor_id_idx
  on public.event_sponsors (sponsor_id);

alter table public.event_sponsors enable row level security;

drop policy if exists "Members can read event sponsors for published events"
  on public.event_sponsors;
create policy "Members can read event sponsors for published events"
  on public.event_sponsors for select to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = event_id
        and (
          e.status = 'published'
          or e.owner_id = auth.uid()
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.role in ('admin', 'host')
          )
        )
    )
  );

drop policy if exists "Admins can insert event sponsors"
  on public.event_sponsors;
create policy "Admins can insert event sponsors"
  on public.event_sponsors for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists "Admins can update event sponsors"
  on public.event_sponsors;
create policy "Admins can update event sponsors"
  on public.event_sponsors for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists "Admins can delete event sponsors"
  on public.event_sponsors;
create policy "Admins can delete event sponsors"
  on public.event_sponsors for delete to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

grant select on public.sponsors to authenticated;
grant select, insert, update, delete on public.sponsors to authenticated;
grant select on public.event_sponsors to authenticated;
grant select, insert, update, delete on public.event_sponsors to authenticated;
grant all on public.sponsors to service_role;
grant all on public.event_sponsors to service_role;

-- ---------------------------------------------------------------------------
-- Link purchase rows to sponsors; allow multiple active sponsorships per event
-- ---------------------------------------------------------------------------

alter table public.event_sponsorships
  add column if not exists sponsor_id uuid references public.sponsors (id) on delete set null,
  add column if not exists sort_order integer not null default 0;

drop index if exists public.event_sponsorships_one_active_per_event;

create index if not exists event_sponsorships_sponsor_id_idx
  on public.event_sponsorships (sponsor_id);

-- Migrate existing paid/approved/claimed sponsorships into sponsors + join rows.
insert into public.sponsors (business_name, contact_email, logo_url)
select distinct on (lower(trim(es.business_name)))
  trim(es.business_name),
  nullif(trim(coalesce(es.contact_email, '')), ''),
  es.logo_url
from public.event_sponsorships es
where es.status in ('paid', 'approved', 'claimed')
  and trim(es.business_name) <> ''
  and not exists (
    select 1
    from public.sponsors s
    where lower(trim(s.business_name)) = lower(trim(es.business_name))
  )
order by lower(trim(es.business_name)), es.created_at asc;

update public.event_sponsorships es
set sponsor_id = s.id,
    updated_at = now()
from public.sponsors s
where es.sponsor_id is null
  and es.status in ('paid', 'approved', 'claimed', 'pending_payment')
  and trim(es.business_name) <> ''
  and lower(trim(s.business_name)) = lower(trim(es.business_name));

insert into public.event_sponsors (event_id, sponsor_id, sort_order)
select
  es.event_id,
  es.sponsor_id,
  coalesce(es.sort_order, 0)
from public.event_sponsorships es
where es.sponsor_id is not null
  and es.status in ('paid', 'approved', 'claimed')
on conflict (event_id, sponsor_id) do nothing;
