-- Complimentary membership-access override (admin-granted, separate from Stripe).
-- Does not store Stripe IDs, coupons, payment methods, or billing JSON.
-- Recognition badge catalog remains in 20260823220000_recognition_badges.sql.

update public.recognition_badges
set
  public_description = 'Recognized as an early member of Huntsville Social Club.',
  updated_at = now()
where slug = 'founding_member'
  and public_description is distinct from
    'Recognized as an early member of Huntsville Social Club.';

create table if not exists public.membership_access_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  tier text not null
    check (tier = any (array['inner_circle'::text, 'elite_circle'::text])),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  reason text,
  granted_by uuid not null references public.profiles (id) on delete restrict,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint membership_access_overrides_revoke_pair check (
    (revoked_at is null and revoked_by is null)
    or (revoked_at is not null and revoked_by is not null)
  ),
  constraint membership_access_overrides_expiry_after_start check (
    expires_at is null or expires_at > starts_at
  )
);

comment on table public.membership_access_overrides is
  'Admin complimentary membership-access override. Separate from Stripe billing. Grants entitlements only while active, unrevoked, and unexpired.';
comment on column public.membership_access_overrides.tier is
  'Override product tier used for entitlements. Never written to profiles.membership_billing.';
comment on column public.membership_access_overrides.reason is
  'Private admin reason. Never exposed to members or public profiles.';
comment on column public.membership_access_overrides.granted_by is
  'Administrator who granted the override. Admin-only.';
comment on column public.membership_access_overrides.revoked_by is
  'Administrator who revoked the override. Admin-only.';

drop trigger if exists set_membership_access_overrides_updated_at
  on public.membership_access_overrides;
create trigger set_membership_access_overrides_updated_at
  before update on public.membership_access_overrides
  for each row
  execute function public.set_updated_at();

create unique index if not exists membership_access_overrides_one_active
  on public.membership_access_overrides (user_id)
  where revoked_at is null;

create index if not exists membership_access_overrides_user_active_idx
  on public.membership_access_overrides (user_id)
  where revoked_at is null;

alter table public.membership_access_overrides enable row level security;

-- No authenticated insert/update/delete/select policies.
-- Members must not read reason/granted_by. Entitlements are computed server-side
-- with the service-role client after requireAdmin() for writes.
drop policy if exists "Members cannot read membership access overrides"
  on public.membership_access_overrides;

revoke all on public.membership_access_overrides from anon, authenticated;
grant all on public.membership_access_overrides to service_role;

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
    'membership_access_override_revoked'::text
  ]));
