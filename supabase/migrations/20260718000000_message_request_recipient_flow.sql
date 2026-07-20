-- Recipient accept/decline for member message requests (replaces staff intro approval).

alter table public.member_conversations
  add column if not exists status text not null default 'accepted'
    check (status = any (array['pending'::text, 'accepted'::text, 'declined'::text])),
  add column if not exists initiated_by uuid
    references public.profiles (id) on delete set null,
  add column if not exists recommendation_id uuid
    references public.curated_match_recommendations (id) on delete set null,
  add column if not exists responded_at timestamptz,
  add column if not exists declined_at timestamptz;

comment on column public.member_conversations.status is
  'pending = awaiting recipient response; accepted = active thread; declined = closed.';
comment on column public.member_conversations.initiated_by is
  'Member who sent the initial message request.';
comment on column public.member_conversations.recommendation_id is
  'Linked curated match recommendation when the request originated from matches.';

update public.member_conversations
set status = 'accepted'
where status is null;

create index if not exists member_conversations_status_updated_idx
  on public.member_conversations (status, updated_at desc);

create index if not exists member_conversations_initiated_by_idx
  on public.member_conversations (initiated_by)
  where status = 'pending';

-- Recipients can read intro requests addressed to them.
drop policy if exists "Targets read intro requests" on public.member_intro_requests;
create policy "Targets read intro requests"
  on public.member_intro_requests
  for select
  to authenticated
  using (target_member_id = (select auth.uid()));

-- Retire staff-queue intros that never opened a conversation.
update public.member_intro_requests
set status = 'closed'
where status = 'pending'
  and recommendation_id is not null
  and conversation_id is null;

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
        and c.status = 'accepted'
        and (c.participant_a = (select auth.uid()) or c.participant_b = (select auth.uid()))
    )
  );
