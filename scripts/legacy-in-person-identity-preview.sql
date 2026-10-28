-- Read-only reconciliation preview. Do not run the commented insert.
-- This file is not a Supabase migration and must not be applied to production
-- until a separate backfill is approved.
--
-- Source field: profiles.approval_gates ->> 'identity_verified' = 'approved'
--
-- Included only when Stripe has not recorded success on the profile.
-- Stripe's success handler writes that same gate, so a verified Stripe status
-- is not independent evidence of an in-person check.
--
-- Not used as evidence:
--   application_status, verified_at, email or phone gates, photo review,
--   founder badges, membership_billing, or complimentary overrides.
--
-- Legacy rows do not invent approved_by or approved_at.
-- reconciled_at is the backfill time, not a historical verification date.

-- Read-only count on 27 Oct 2026, production project jjjskyitlvjvxabkyipa.
-- Not a backfill. Re-run the selects before any later write.
--
-- legacy_in_person_candidates = 11
--   application_status approved, identity_verification_status not_started: 8
--   application_status approved, identity_verification_status pending: 2
--   application_status approved, identity_verification_status requires_input: 1
-- stripe_verified_with_same_gate, excluded from this insert: 64
--
-- The separate unsynced Stripe repair stays inside this selection for as long
-- as that profile's identity_verification_status is not verified. Record the
-- in-person row before that repair. Do not delete either record.
-- The Stripe session itself was not replayed for this preview.

-- Candidate count
select count(*) as legacy_in_person_candidates
from public.profiles p
where p.approval_gates ->> 'identity_verified' = 'approved'
  and p.identity_verification_status is distinct from 'verified';

-- Candidate breakdown. No names, emails, or session ids.
select
  p.application_status,
  p.identity_verification_status,
  count(*) as profiles
from public.profiles p
where p.approval_gates ->> 'identity_verified' = 'approved'
  and p.identity_verification_status is distinct from 'verified'
group by p.application_status, p.identity_verification_status
order by profiles desc;

-- Excluded: gate approved and Stripe status already verified.
select count(*) as stripe_verified_with_same_gate
from public.profiles p
where p.approval_gates ->> 'identity_verified' = 'approved'
  and p.identity_verification_status = 'verified';

-- Not authorized. Preserves unknown historical admin and timestamp.
-- insert into public.in_person_identity_verifications (
--   profile_id,
--   method,
--   status,
--   source,
--   approved_by,
--   approved_at,
--   reconciled_at,
--   note
-- )
-- select
--   p.id,
--   'in_person',
--   'verified',
--   'legacy_approval_gates.identity_verified',
--   null,
--   null,
--   now(),
--   null
-- from public.profiles p
-- where p.approval_gates ->> 'identity_verified' = 'approved'
--   and p.identity_verification_status is distinct from 'verified'
--   and not exists (
--     select 1
--     from public.in_person_identity_verifications existing
--     where existing.profile_id = p.id
--       and existing.revoked_at is null
--   );
