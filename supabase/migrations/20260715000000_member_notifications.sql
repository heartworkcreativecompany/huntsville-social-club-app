-- In-app member notifications (v1).

create table if not exists public.member_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  href text not null,
  read_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists member_notifications_user_created_idx
  on public.member_notifications (user_id, created_at desc);

create index if not exists member_notifications_user_unread_idx
  on public.member_notifications (user_id)
  where read_at is null;

alter table public.member_notifications enable row level security;

drop policy if exists "Members read own notifications" on public.member_notifications;
create policy "Members read own notifications"
  on public.member_notifications
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Members mark own notifications read" on public.member_notifications;
create policy "Members mark own notifications read"
  on public.member_notifications
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

comment on table public.member_notifications is
  'In-app notification feed for members. Inserts are server-side via service role.';
