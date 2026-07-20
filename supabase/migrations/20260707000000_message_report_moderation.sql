-- Staff moderation fields for message reports.

alter table public.member_conversation_reports
  add column if not exists admin_notes text,
  add column if not exists admin_reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles (id) on delete set null;

comment on column public.member_conversation_reports.admin_notes is
  'Internal staff notes — not shown to members.';
