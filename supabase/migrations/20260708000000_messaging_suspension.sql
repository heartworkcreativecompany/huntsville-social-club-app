-- Messaging suspension + moderation audit log.

alter table public.profiles
  add column if not exists messaging_suspended_at timestamptz,
  add column if not exists messaging_suspension_reason text,
  add column if not exists messaging_suspended_by uuid
    references public.profiles (id) on delete set null;

comment on column public.profiles.messaging_suspended_at is
  'When set, member cannot send messages or use messaging actions.';
comment on column public.profiles.messaging_suspension_reason is
  'Internal staff rationale for messaging suspension.';

create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  target_member_id uuid references public.profiles (id) on delete set null,
  action_type text not null
    check (action_type = any (array[
      'message_report_reviewed'::text,
      'message_report_dismissed'::text,
      'messaging_suspended'::text,
      'admin_member_block'::text
    ])),
  source_type text,
  source_id uuid,
  reason text,
  details text,
  created_at timestamptz not null default now()
);

create index if not exists moderation_actions_created_idx
  on public.moderation_actions (created_at desc);

create index if not exists moderation_actions_target_idx
  on public.moderation_actions (target_member_id, created_at desc);

create index if not exists profiles_messaging_suspended_idx
  on public.profiles (messaging_suspended_at)
  where messaging_suspended_at is not null;

alter table public.moderation_actions enable row level security;

drop policy if exists "Admins read moderation actions" on public.moderation_actions;
create policy "Admins read moderation actions"
  on public.moderation_actions
  for select
  to authenticated
  using (public.is_admin((select auth.uid())));
