-- Dating compatibility age and preferred match range.
-- Private dating-profile data, not public directory metadata.
--
-- Compatibility / rollback:
--   Columns are nullable so existing completed questionnaires keep working.
--   No ages are backfilled or invented.
--   Application completion and match generation require valid values.
--   To roll back: drop the five check constraints, drop the three columns,
--   and recreate member_profiles without them (see 20260818000000).

alter table public.profiles
  add column if not exists age integer,
  add column if not exists preferred_match_age_min integer,
  add column if not exists preferred_match_age_max integer;

alter table public.profiles
  drop constraint if exists profiles_age_adult_range,
  drop constraint if exists profiles_preferred_match_age_min_adult,
  drop constraint if exists profiles_preferred_match_age_max_adult,
  drop constraint if exists profiles_preferred_match_age_order,
  drop constraint if exists profiles_dating_age_preferences_complete_or_null;

alter table public.profiles
  add constraint profiles_age_adult_range
    check (age is null or (age >= 18 and age <= 99)),
  add constraint profiles_preferred_match_age_min_adult
    check (
      preferred_match_age_min is null
      or (preferred_match_age_min >= 18 and preferred_match_age_min <= 99)
    ),
  add constraint profiles_preferred_match_age_max_adult
    check (
      preferred_match_age_max is null
      or (preferred_match_age_max >= 18 and preferred_match_age_max <= 99)
    ),
  add constraint profiles_preferred_match_age_order
    check (
      preferred_match_age_min is null
      or preferred_match_age_max is null
      or preferred_match_age_min <= preferred_match_age_max
    ),
  add constraint profiles_dating_age_preferences_complete_or_null
    check (
      (
        age is null
        and preferred_match_age_min is null
        and preferred_match_age_max is null
      )
      or (
        age is not null
        and preferred_match_age_min is not null
        and preferred_match_age_max is not null
      )
    );

comment on column public.profiles.age is
  'Private dating-profile age (18–99). Nullable for members who completed compatibility before this column existed. Never backfilled. Not directory metadata.';

comment on column public.profiles.preferred_match_age_min is
  'Private minimum age this member is open to dating. Nullable until the member saves a valid range. Not shown on public profiles.';

comment on column public.profiles.preferred_match_age_max is
  'Private maximum age this member is open to dating. Nullable until the member saves a valid range. Not shown on public profiles.';

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
  messaging_suspended_by
from public.profiles;

comment on view public.member_profiles is
  'Member-facing profile reads. Omits profiles.email; inherits profiles RLS (security_invoker).';

grant select on public.member_profiles to authenticated;
grant select on public.member_profiles to service_role;
