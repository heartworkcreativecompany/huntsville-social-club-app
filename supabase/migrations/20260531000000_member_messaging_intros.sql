-- Member messaging + curated intro requests (MVP foundation).

create table if not exists public.member_conversations (
  id uuid primary key default gen_random_uuid(),
  participant_a uuid not null references public.profiles (id) on delete cascade,
  participant_b uuid not null references public.profiles (id) on delete cascade,
  updated_at timestamptz not null default now(),
  constraint member_conversations_ordered check (participant_a < participant_b),
  constraint member_conversations_distinct check (participant_a <> participant_b),
  unique (participant_a, participant_b)
);

create table if not exists public.member_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.member_conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint member_messages_body_length check (char_length(trim(body)) > 0)
);

create table if not exists public.member_intro_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  target_member_id uuid references public.profiles (id) on delete set null,
  kind text not null default 'curated'
    check (kind = any (array['curated'::text, 'member'::text])),
  note text,
  status text not null default 'pending'
    check (status = any (array['pending'::text, 'matched'::text, 'declined'::text, 'closed'::text])),
  created_at timestamptz not null default now()
);

create index if not exists member_messages_conversation_created_idx
  on public.member_messages (conversation_id, created_at desc);

create index if not exists member_conversations_participant_a_idx
  on public.member_conversations (participant_a);

create index if not exists member_conversations_participant_b_idx
  on public.member_conversations (participant_b);

create index if not exists member_intro_requests_requester_idx
  on public.member_intro_requests (requester_id, created_at desc);

alter table public.member_conversations enable row level security;
alter table public.member_messages enable row level security;
alter table public.member_intro_requests enable row level security;

drop policy if exists "Participants read conversations" on public.member_conversations;
create policy "Participants read conversations"
  on public.member_conversations
  for select
  to authenticated
  using (
    participant_a = (select auth.uid())
    or participant_b = (select auth.uid())
    or public.is_admin((select auth.uid()))
  );

drop policy if exists "Participants read messages" on public.member_messages;
create policy "Participants read messages"
  on public.member_messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.member_conversations c
      where c.id = conversation_id
        and (
          c.participant_a = (select auth.uid())
          or c.participant_b = (select auth.uid())
          or public.is_admin((select auth.uid()))
        )
    )
  );

drop policy if exists "Participants send messages" on public.member_messages;
create policy "Participants send messages"
  on public.member_messages
  for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1
      from public.member_conversations c
      where c.id = conversation_id
        and (c.participant_a = (select auth.uid()) or c.participant_b = (select auth.uid()))
    )
  );

drop policy if exists "Members read own intro requests" on public.member_intro_requests;
create policy "Members read own intro requests"
  on public.member_intro_requests
  for select
  to authenticated
  using (
    requester_id = (select auth.uid())
    or public.is_admin((select auth.uid()))
  );

drop policy if exists "Approved members create intro requests" on public.member_intro_requests;
create policy "Approved members create intro requests"
  on public.member_intro_requests
  for insert
  to authenticated
  with check (
    requester_id = (select auth.uid())
    and exists (
      select 1
      from public.profiles p
      where p.id = requester_id
        and p.application_status = 'approved'
    )
  );
