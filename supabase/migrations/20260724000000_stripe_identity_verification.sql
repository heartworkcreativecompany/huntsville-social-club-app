-- Stripe Identity verification status on profiles (application / account verification).
-- Does not store document images — only session status metadata from Stripe webhooks.

alter table public.profiles
  add column if not exists identity_verification_status text not null default 'not_started',
  add column if not exists identity_verification_session_id text,
  add column if not exists identity_verified_at timestamptz,
  add column if not exists identity_verification_last_error text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_identity_verification_status_check'
  ) then
    alter table public.profiles
      add constraint profiles_identity_verification_status_check
      check (
        identity_verification_status in (
          'not_started',
          'pending',
          'processing',
          'verified',
          'requires_input',
          'canceled'
        )
      );
  end if;
end $$;

comment on column public.profiles.identity_verification_status is
  'Stripe Identity VerificationSession status (not_started|pending|processing|verified|requires_input|canceled).';

comment on column public.profiles.identity_verification_session_id is
  'Latest Stripe Identity VerificationSession id (vs_...). No document images stored.';

comment on column public.profiles.identity_verified_at is
  'Timestamp when Stripe Identity reported identity.verification_session.verified.';

comment on column public.profiles.identity_verification_last_error is
  'Last Stripe Identity error code/reason when status is requires_input. Never stores document images.';

-- Refresh member_profiles so applicants can read their own identity status (RLS still applies).
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
  messaging_suspended_by
from public.profiles;

comment on view public.member_profiles is
  'Member-facing profile reads. Omits profiles.email; inherits profiles RLS (security_invoker).';

grant select on public.member_profiles to authenticated;
grant select on public.member_profiles to service_role;
