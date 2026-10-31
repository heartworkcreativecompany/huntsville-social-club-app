-- Repair preview only. Do not run a write against production from this file.
--
-- One approved profile has a verified Stripe Identity session that was not
-- saved onto identity_verification_status. Find it by comparing Stripe
-- VerificationSessions to profiles. Do not print the member, the session id,
-- or document data.
--
-- Selection:
--   Stripe VerificationSession.status = verified
--   Session metadata.user_id matches profiles.id
--   profiles.identity_verification_status is distinct from 'verified'
--
-- Repair, when separately authorized:
--   Retrieve that session from Stripe.
--   Call applyIdentityVerificationSession.
--   That writes Stripe status, session id, and identity_verified_at only.
--   Do not update or delete in_person_identity_verifications.
--   A profile may keep both a verified Stripe result and an in-person row.
--
-- Database-only slice of the same search. This cannot see an unsynced Stripe
-- success by itself; it lists stored sessions whose profile is not verified.
--
-- Read-only database count on 27 Oct 2026:
--   15 profiles have a stored session id and a status other than verified
--   (pending 9, requires_input 6).
-- That list is wider than the repair. Unfinished sessions stay unfinished.
--
-- Prior Stripe comparison the same day, not replayed here:
--   1 profile has a verified VerificationSession whose profile status is not
--   verified. Repair that profile by retrieving its session and calling
--   applyIdentityVerificationSession. Do not print the member or session id.
--   Do not update in_person_identity_verifications.
select
  identity_verification_status,
  count(*) as profiles_with_stored_session
from public.profiles
where identity_verification_session_id is not null
  and identity_verification_status is distinct from 'verified'
group by identity_verification_status
order by profiles_with_stored_session desc;
