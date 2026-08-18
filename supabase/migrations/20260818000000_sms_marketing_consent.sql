-- Phone verification timestamp + optional SMS marketing consent (Twilio A2P 10DLC).
-- Verification status remains separate from promotional/recurring text opt-in.

alter table public.profiles
  add column if not exists phone_verified_at timestamptz,
  add column if not exists sms_marketing_opt_in boolean not null default false,
  add column if not exists sms_marketing_opt_in_at timestamptz,
  add column if not exists sms_marketing_consent_version text,
  add column if not exists sms_marketing_consent_source text,
  add column if not exists sms_marketing_consent_phone_e164 text,
  add column if not exists sms_marketing_opted_out_at timestamptz;

comment on column public.profiles.phone_verified_at is
  'When the member last completed one-time SMS phone verification (account security). Separate from marketing consent.';

comment on column public.profiles.sms_marketing_opt_in is
  'True only after affirmative optional consent for recurring event/club-update/promotional texts. Default false.';

comment on column public.profiles.sms_marketing_opt_in_at is
  'Timestamp of the current affirmative marketing SMS opt-in. Preserved across resends unless newly granted or consent version changes.';

comment on column public.profiles.sms_marketing_consent_version is
  'Version id of the marketing SMS consent copy the member agreed to (e.g. 2026-08-18).';

comment on column public.profiles.sms_marketing_consent_source is
  'Form/page source for marketing SMS consent (e.g. membership_phone_verification_web).';

comment on column public.profiles.sms_marketing_consent_phone_e164 is
  'E.164 mobile number associated with the marketing SMS consent record at opt-in time.';

comment on column public.profiles.sms_marketing_opted_out_at is
  'When the member opted out of recurring marketing texts (e.g. STOP). Null while opted in.';

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
