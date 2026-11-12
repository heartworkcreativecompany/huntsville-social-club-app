-- Permanent member removal. Staff notes live in member_removal_records, not on profiles.

alter table public.profiles
  add column if not exists removed_at timestamptz;

comment on column public.profiles.removed_at is
  'When set, the member is permanently removed from member-facing surfaces.';

create index if not exists profiles_removed_at_idx
  on public.profiles (removed_at)
  where removed_at is not null;

create table if not exists public.member_removal_records (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  removed_at timestamptz not null default now(),
  removed_by uuid references public.profiles (id) on delete set null,
  reason_category text not null,
  internal_note text,
  stripe_result text,
  auth_result text,
  restored_at timestamptz,
  restored_by uuid references public.profiles (id) on delete set null,
  restore_note text
);

comment on table public.member_removal_records is
  'Staff record of a permanent removal. Readable and writable by administrators and the service role only.';

create index if not exists member_removal_records_profile_id_idx
  on public.member_removal_records (profile_id, removed_at desc);

alter table public.member_removal_records enable row level security;

drop policy if exists "Admins manage member removal records" on public.member_removal_records;
create policy "Admins manage member removal records"
  on public.member_removal_records
  for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

revoke all on public.member_removal_records from anon;
grant select, insert, update, delete on public.member_removal_records to authenticated;
grant select, insert, update, delete on public.member_removal_records to service_role;

drop policy if exists "Removed profiles are hidden from other members" on public.profiles;
create policy "Removed profiles are hidden from other members"
  on public.profiles
  as restrictive
  for select
  to authenticated
  using (
    removed_at is null
    or id = (select auth.uid())
    or public.is_admin((select auth.uid()))
  );

drop policy if exists "Removed members cannot change profiles" on public.profiles;
create policy "Removed members cannot change profiles"
  on public.profiles
  as restrictive
  for update
  to authenticated
  using (
    public.is_admin((select auth.uid()))
    or (
      id = (select auth.uid())
      and removed_at is null
    )
  )
  with check (
    public.is_admin((select auth.uid()))
    or (
      id = (select auth.uid())
      and removed_at is null
    )
  );

create table if not exists public.removed_member_emails (
  id uuid primary key default gen_random_uuid(),
  email_normalized text not null,
  profile_id uuid references public.profiles (id) on delete set null,
  removed_at timestamptz not null default now(),
  removed_by uuid references public.profiles (id) on delete set null,
  constraint removed_member_emails_email_normalized_key unique (email_normalized),
  constraint removed_member_emails_normalized_chk
    check (email_normalized = lower(btrim(email_normalized)) and email_normalized <> '')
);

comment on table public.removed_member_emails is
  'Emails that may not sign up or apply again. Readable by administrators and the service role.';

alter table public.removed_member_emails enable row level security;

drop policy if exists "Admins manage removed member emails" on public.removed_member_emails;
create policy "Admins manage removed member emails"
  on public.removed_member_emails
  for all
  to authenticated
  using (public.is_admin((select auth.uid())))
  with check (public.is_admin((select auth.uid())));

revoke all on public.removed_member_emails from anon;
grant select, insert, update, delete on public.removed_member_emails to authenticated;
grant select, insert, update, delete on public.removed_member_emails to service_role;

drop view if exists public.member_profiles;

create view public.member_profiles
with (security_invoker = true) as
select
  id,
  full_name,
  role,
  created_at,
  updated_at,
  contact_email,
  show_contact_email,
  verified_phone_e164,
  phone_verified_at,
  sms_marketing_opt_in,
  sms_marketing_opt_in_at,
  sms_marketing_consent_version,
  sms_marketing_consent_source,
  sms_marketing_consent_phone_e164,
  sms_marketing_opted_out_at,
  identity_verification_status,
  identity_verification_session_id,
  identity_verified_at,
  identity_verification_last_error,
  application_status,
  membership_intent,
  application_draft,
  application_submitted_at,
  application_reviewed_at,
  verified_at,
  admin_review_notes,
  location_area,
  referral_source,
  verification_state,
  approval_gates,
  locality_confirmation,
  premium_verification,
  membership_billing,
  discovery_intent,
  location_city,
  location_zip,
  birth_year,
  discovery_interests,
  discovery_industry,
  connection_intents,
  connections_open_to,
  compatibility_questionnaire,
  compatibility_completed_at,
  compatibility_updated_at,
  age,
  preferred_match_age_min,
  preferred_match_age_max,
  wants_curated_matches,
  curated_matches_paused_at,
  curated_matches_pause_reason,
  dating_connection_enabled_at,
  dating_connection_removed_at,
  messaging_entitlement_lost_at,
  messaging_entitlement_restored_at,
  last_match_generation_at,
  last_match_review_at,
  profile_pending_revision,
  profile_revision_status,
  profile_revision_submitted_at,
  profile_revision_reviewed_at,
  profile_revision_admin_notes,
  profile_revision_history,
  messaging_suspended_at,
  messaging_suspension_reason,
  messaging_suspended_by,
  removed_at
from public.profiles;

comment on view public.member_profiles is
  'Member-facing profile reads. Omits account email. Inherits profiles RLS.';

grant select on public.member_profiles to authenticated;
grant select on public.member_profiles to service_role;

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
    'in_person_identity_revoked'::text,
    'member_removed'::text,
    'member_restored'::text
  ]));
