-- Append-only revision moderation history (Phase 3).

alter table public.profiles
  add column if not exists profile_revision_history jsonb not null default '[]'::jsonb;

comment on column public.profiles.profile_revision_history is
  'Past approved/rejected profile revisions — newest entries appended by admin actions.';
