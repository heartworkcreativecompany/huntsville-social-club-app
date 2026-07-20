-- Post-approval profile revision queue (Phase 2 foundation).

alter table public.profiles
  add column if not exists profile_pending_revision jsonb,
  add column if not exists profile_revision_status text not null default 'none'
    check (profile_revision_status in ('none', 'pending', 'rejected')),
  add column if not exists profile_revision_submitted_at timestamptz,
  add column if not exists profile_revision_reviewed_at timestamptz,
  add column if not exists profile_revision_admin_notes text;

comment on column public.profiles.profile_pending_revision is
  'Proposed profile edits from approved members — not public until staff approves.';
comment on column public.profiles.profile_revision_status is
  'none | pending | rejected — live profile stays published while pending.';

create index if not exists profiles_profile_revision_pending_idx
  on public.profiles (profile_revision_submitted_at desc)
  where profile_revision_status = 'pending';
