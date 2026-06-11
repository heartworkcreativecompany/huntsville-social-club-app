-- Membership systems foundation: verification, approval gates, locality,
-- premium verification, billing, and discovery-indexed columns.

alter table public.profiles
  add column if not exists verification_state jsonb not null default '{}'::jsonb,
  add column if not exists approval_gates jsonb not null default '{}'::jsonb,
  add column if not exists locality_confirmation jsonb not null default '{}'::jsonb,
  add column if not exists premium_verification jsonb not null default '{}'::jsonb,
  add column if not exists membership_billing jsonb not null default '{}'::jsonb,
  add column if not exists discovery_intent text,
  add column if not exists location_city text,
  add column if not exists location_zip text,
  add column if not exists birth_year integer,
  add column if not exists discovery_interests text[] not null default '{}',
  add column if not exists discovery_industry text;

comment on column public.profiles.verification_state is
  'Public-safe verification badge statuses keyed by badge type.';
comment on column public.profiles.approval_gates is
  'Required approval gate statuses — admin workflow; blocks final approval.';
comment on column public.profiles.locality_confirmation is
  'Locality trust signal review state and optional supporting context.';
comment on column public.profiles.premium_verification is
  'Private vendor verification results — admin only.';
comment on column public.profiles.membership_billing is
  'Membership plan, application fee, renewal, and payment failure state.';

create index if not exists profiles_discovery_intent_idx
  on public.profiles (discovery_intent)
  where application_status = 'approved';

create index if not exists profiles_location_city_idx
  on public.profiles (location_city)
  where application_status = 'approved';

create index if not exists profiles_location_zip_idx
  on public.profiles (location_zip)
  where application_status = 'approved';

create index if not exists profiles_birth_year_idx
  on public.profiles (birth_year)
  where application_status = 'approved';
