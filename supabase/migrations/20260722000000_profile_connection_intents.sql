-- Idempotent repair for remotes that applied member_profiles before connection_intents existed.
-- Safe to rerun: ensures column + backfill, then refreshes member_profiles only after the column exists.

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'connection_intents'
  ) then
    alter table public.profiles
      add column connection_intents text[] not null default '{}';

    comment on column public.profiles.connection_intents is
      'Canonical connection intent categories (networking, dating, friends). Drives directory filters and badges.';
  end if;
end $$;

-- Backfill from legacy connections_open_to labels (idempotent: only empty arrays).
update public.profiles p
set connection_intents = sub.intents
from (
  select
    id,
    array_remove(
      array[
        case
          when exists (
            select 1
            from unnest(coalesce(connections_open_to, '{}'::text[])) as entry(value)
            where lower(trim(value)) in ('networking', 'professional peers')
              or trim(value) = 'Networking'
          )
          then 'networking'
        end,
        case
          when exists (
            select 1
            from unnest(coalesce(connections_open_to, '{}'::text[])) as entry(value)
            where lower(trim(value)) like '%dating%'
              or trim(value) = 'Dating'
          )
          then 'dating'
        end,
        case
          when exists (
            select 1
            from unnest(coalesce(connections_open_to, '{}'::text[])) as entry(value)
            where lower(trim(value)) like '%friend%'
              or trim(value) = 'Friends'
              or trim(value) = 'New friends'
          )
          then 'friends'
        end
      ]::text[],
      null
    ) as intents
  from public.profiles
) sub
where p.id = sub.id
  and cardinality(p.connection_intents) = 0
  and cardinality(sub.intents) > 0;

-- Fallback from legacy discovery_intent (idempotent: only empty arrays).
update public.profiles
set connection_intents = array[discovery_intent]::text[]
where cardinality(connection_intents) = 0
  and discovery_intent in ('networking', 'dating', 'friends');

-- Strip canonical intent labels from display-only connections_open_to (idempotent).
update public.profiles
set connections_open_to = coalesce(
  (
    select array_agg(distinct entry.value order by entry.value)
    from unnest(coalesce(connections_open_to, '{}'::text[])) as entry(value)
    where lower(trim(entry.value)) not in ('networking', 'dating', 'friends')
      and trim(entry.value) not in (
        'Networking',
        'Dating',
        'Friends',
        'New friends',
        'Professional peers'
      )
  ),
  '{}'::text[]
);

-- Refresh member_profiles only after connection_intents is guaranteed to exist.
-- Postgres cannot reorder/rename view columns with CREATE OR REPLACE VIEW (42P16), so drop and recreate.
-- Exposes both connection_intents (canonical: filters, badges, compatibility) and connections_open_to
-- (display-only connection type labels). connection_intents is authoritative for intent classification.

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
  'Member-facing profile reads. Omits profiles.email; inherits profiles RLS (security_invoker). connection_intents is canonical for filters/badges; connections_open_to is display-only.';

grant select on public.member_profiles to authenticated;
grant select on public.member_profiles to service_role;
