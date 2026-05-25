create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  visibility text not null default 'private' check (visibility in ('private', 'members', 'public')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists events_owner_id_idx on public.events(owner_id);
create index if not exists events_starts_at_idx on public.events(starts_at);

alter table public.events enable row level security;

create policy "Users can view their own events"
on public.events
for select
to authenticated
using ((select auth.uid()) = owner_id);

create policy "Users can insert their own events"
on public.events
for insert
to authenticated
with check ((select auth.uid()) = owner_id);

create policy "Users can update their own events"
on public.events
for update
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy "Users can delete their own events"
on public.events
for delete
to authenticated
using ((select auth.uid()) = owner_id);
