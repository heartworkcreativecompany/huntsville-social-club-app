-- In-person identity verification, stored separately from Stripe Identity.
-- Does not write Stripe status, session ids, or document images.
-- Does not change messaging policies or public badge rules.

create table if not exists public.in_person_identity_verifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  method text not null default 'in_person'
    check (method = 'in_person'),
  status text not null
    check (status = any (array['verified'::text, 'revoked'::text])),
  source text not null
    check (
      source = any (array[
        'admin_action'::text,
        'legacy_approval_gates.identity_verified'::text
      ])
    ),
  approved_by uuid references public.profiles (id) on delete restrict,
  approved_at timestamptz,
  reconciled_at timestamptz,
  note text,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint in_person_identity_revoke_pair check (
    (
      status = 'verified'
      and revoked_at is null
      and revoked_by is null
    )
    or (
      status = 'revoked'
      and revoked_at is not null
      and revoked_by is not null
    )
  ),
  constraint in_person_identity_source_audit check (
    (
      source = 'admin_action'
      and approved_by is not null
      and approved_at is not null
      and reconciled_at is null
    )
    or (
      source = 'legacy_approval_gates.identity_verified'
      and approved_by is null
      and approved_at is null
      and reconciled_at is not null
    )
  )
);

comment on table public.in_person_identity_verifications is
  'In-person identity verification. Separate from Stripe Identity columns. No document images.';
comment on column public.in_person_identity_verifications.source is
  'admin_action for a new admin approval. legacy_approval_gates.identity_verified for a later backfill of the old identity step. Never Stripe.';
comment on column public.in_person_identity_verifications.approved_at is
  'When an admin recorded the in-person check. Null on legacy rows because the historical time was not stored.';
comment on column public.in_person_identity_verifications.reconciled_at is
  'When a legacy identity-step row was recognized. Not the historical verification date.';
comment on column public.in_person_identity_verifications.note is
  'Optional internal note. Not a document image and not shown on member profiles.';

drop trigger if exists set_in_person_identity_verifications_updated_at
  on public.in_person_identity_verifications;
create trigger set_in_person_identity_verifications_updated_at
  before update on public.in_person_identity_verifications
  for each row
  execute function public.set_updated_at();

create unique index if not exists in_person_identity_one_active
  on public.in_person_identity_verifications (profile_id)
  where revoked_at is null;

alter table public.in_person_identity_verifications enable row level security;

revoke all on public.in_person_identity_verifications from anon, authenticated;
grant all on public.in_person_identity_verifications to service_role;

-- Future messaging and badge checks. Not referenced by current messaging policies.
create or replace function public.profile_has_accepted_identity(check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.profiles p
      where p.id = check_user_id
        and p.identity_verification_status = 'verified'
    )
    or exists (
      select 1
      from public.in_person_identity_verifications v
      where v.profile_id = check_user_id
        and v.method = 'in_person'
        and v.status = 'verified'
        and v.revoked_at is null
    );
$$;

revoke all on function public.profile_has_accepted_identity(uuid) from public;
revoke all on function public.profile_has_accepted_identity(uuid) from anon;
revoke all on function public.profile_has_accepted_identity(uuid) from authenticated;
grant execute on function public.profile_has_accepted_identity(uuid) to service_role;

alter table public.moderation_actions
  drop constraint if exists moderation_actions_action_type_check;

alter table public.moderation_actions
  add constraint moderation_actions_action_type_check
  check (action_type = any (array[
    'message_report_reviewed'::text,
    'message_report_dismissed'::text,
    'messaging_suspended'::text,
    'messaging_unsuspended'::text,
    'admin_member_block'::text,
    'member_deleted'::text,
    'recognition_badge_awarded'::text,
    'recognition_badge_revoked'::text,
    'membership_access_override_granted'::text,
    'membership_access_override_updated'::text,
    'membership_access_override_revoked'::text,
    'in_person_identity_verified'::text,
    'in_person_identity_revoked'::text
  ]));
