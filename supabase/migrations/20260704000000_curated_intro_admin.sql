-- Staff workflow for curated match intro requests.

alter table public.member_intro_requests
  add column if not exists admin_notes text,
  add column if not exists admin_reviewed_at timestamptz,
  add column if not exists conversation_id uuid
    references public.member_conversations (id) on delete set null;

comment on column public.member_intro_requests.admin_notes is
  'Internal staff notes — not shown to members.';
comment on column public.member_intro_requests.conversation_id is
  'Conversation opened when staff approves a curated intro.';

create index if not exists member_intro_requests_curated_pending_idx
  on public.member_intro_requests (created_at desc)
  where recommendation_id is not null and status = 'pending';
