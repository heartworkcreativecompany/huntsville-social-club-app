-- Member messaging trust & safety foundation.

create table if not exists public.member_member_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_member_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint member_member_blocks_distinct check (blocker_id <> blocked_member_id),
  unique (blocker_id, blocked_member_id)
);

create index if not exists member_member_blocks_blocker_idx
  on public.member_member_blocks (blocker_id, created_at desc);

create index if not exists member_member_blocks_blocked_idx
  on public.member_member_blocks (blocked_member_id, created_at desc);

create table if not exists public.member_conversation_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  conversation_id uuid not null references public.member_conversations (id) on delete cascade,
  reported_member_id uuid references public.profiles (id) on delete set null,
  reason text not null
    check (reason = any (array[
      'harassment'::text,
      'spam'::text,
      'inappropriate'::text,
      'safety'::text,
      'other'::text
    ])),
  details text,
  status text not null default 'pending'
    check (status = any (array[
      'pending'::text,
      'reviewed'::text,
      'dismissed'::text
    ])),
  created_at timestamptz not null default now()
);

create index if not exists member_conversation_reports_pending_idx
  on public.member_conversation_reports (created_at desc)
  where status = 'pending';

create index if not exists member_conversation_reports_reporter_idx
  on public.member_conversation_reports (reporter_id, conversation_id, created_at desc);

alter table public.member_member_blocks enable row level security;
alter table public.member_conversation_reports enable row level security;

drop policy if exists "Members read own blocks" on public.member_member_blocks;
create policy "Members read own blocks"
  on public.member_member_blocks
  for select
  to authenticated
  using (
    blocker_id = (select auth.uid())
    or blocked_member_id = (select auth.uid())
    or public.is_admin((select auth.uid()))
  );

drop policy if exists "Members create own blocks" on public.member_member_blocks;
create policy "Members create own blocks"
  on public.member_member_blocks
  for insert
  to authenticated
  with check (blocker_id = (select auth.uid()));

drop policy if exists "Members read own conversation reports" on public.member_conversation_reports;
create policy "Members read own conversation reports"
  on public.member_conversation_reports
  for select
  to authenticated
  using (
    reporter_id = (select auth.uid())
    or public.is_admin((select auth.uid()))
  );

drop policy if exists "Members report conversations they are in" on public.member_conversation_reports;
create policy "Members report conversations they are in"
  on public.member_conversation_reports
  for insert
  to authenticated
  with check (
    reporter_id = (select auth.uid())
    and exists (
      select 1
      from public.member_conversations c
      where c.id = conversation_id
        and (
          c.participant_a = (select auth.uid())
          or c.participant_b = (select auth.uid())
        )
    )
  );
