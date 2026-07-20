-- Thread UX: system welcome messages, read receipts, conversation touch updates.

alter table public.member_messages
  add column if not exists is_system boolean not null default false;

comment on column public.member_messages.is_system is
  'Club-authored message (e.g. curated intro welcome). Rendered separately from member sends.';

drop policy if exists "Participants update conversations" on public.member_conversations;
create policy "Participants update conversations"
  on public.member_conversations
  for update
  to authenticated
  using (
    participant_a = (select auth.uid())
    or participant_b = (select auth.uid())
  )
  with check (
    participant_a = (select auth.uid())
    or participant_b = (select auth.uid())
  );

drop policy if exists "Recipients mark messages read" on public.member_messages;
create policy "Recipients mark messages read"
  on public.member_messages
  for update
  to authenticated
  using (
    sender_id <> (select auth.uid())
    and exists (
      select 1
      from public.member_conversations c
      where c.id = conversation_id
        and (
          c.participant_a = (select auth.uid())
          or c.participant_b = (select auth.uid())
        )
    )
  )
  with check (
    sender_id <> (select auth.uid())
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
