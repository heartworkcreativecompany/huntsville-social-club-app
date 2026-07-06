-- Private compatibility questionnaire + curated match batches (Phase 1 foundation).

alter table public.profiles
  add column if not exists connections_open_to text[] not null default '{}',
  add column if not exists compatibility_questionnaire jsonb,
  add column if not exists compatibility_completed_at timestamptz,
  add column if not exists compatibility_updated_at timestamptz,
  add column if not exists wants_curated_matches boolean not null default true,
  add column if not exists curated_matches_paused_at timestamptz,
  add column if not exists curated_matches_pause_reason text
    check (
      curated_matches_pause_reason is null
      or curated_matches_pause_reason = any (
        array[
          'user_paused'::text,
          'dating_removed'::text,
          'subscription_inactive'::text,
          'not_approved'::text
        ]
      )
    ),
  add column if not exists dating_connection_enabled_at timestamptz,
  add column if not exists dating_connection_removed_at timestamptz,
  add column if not exists messaging_entitlement_lost_at timestamptz,
  add column if not exists messaging_entitlement_restored_at timestamptz,
  add column if not exists last_match_generation_at timestamptz;

comment on column public.profiles.connections_open_to is
  'Connection types open to — synced from application_draft; includes Dating for match eligibility.';
comment on column public.profiles.compatibility_questionnaire is
  'Private compatibility answers — never exposed in directory or public profile.';

create index if not exists profiles_connections_open_to_gin_idx
  on public.profiles using gin (connections_open_to);

create index if not exists profiles_match_pool_idx
  on public.profiles (application_status)
  where connections_open_to @> array['Dating']::text[]
    and compatibility_completed_at is not null
    and wants_curated_matches = true
    and curated_matches_paused_at is null;

-- Backfill Dating from legacy discovery_intent.
update public.profiles
set connections_open_to = array_append(connections_open_to, 'Dating')
where discovery_intent = 'dating'
  and not (connections_open_to @> array['Dating']::text[]);

create table if not exists public.curated_match_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'scheduled'
    check (status = any (array[
      'scheduled'::text,
      'processing'::text,
      'delivered'::text,
      'empty'::text,
      'cancelled'::text
    ])),
  scheduled_for timestamptz not null,
  delivered_at timestamptz,
  match_count int not null default 0,
  cancellation_reason text,
  created_at timestamptz not null default now()
);

create index if not exists curated_match_batches_user_status_idx
  on public.curated_match_batches (user_id, status, scheduled_for desc);

create index if not exists curated_match_batches_scheduled_idx
  on public.curated_match_batches (scheduled_for)
  where status = 'scheduled';

create table if not exists public.curated_match_recommendations (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.curated_match_batches (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  recommended_user_id uuid not null references public.profiles (id) on delete cascade,
  compatibility_score numeric(5, 2) not null,
  score_breakdown jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status = any (array[
      'pending'::text,
      'viewed'::text,
      'accepted'::text,
      'passed'::text,
      'expired'::text
    ])),
  created_at timestamptz not null default now(),
  unique (user_id, recommended_user_id)
);

create index if not exists curated_match_recommendations_user_status_idx
  on public.curated_match_recommendations (user_id, status, created_at desc);

alter table public.member_intro_requests
  add column if not exists recommendation_id uuid
    references public.curated_match_recommendations (id) on delete set null;

alter table public.curated_match_batches enable row level security;
alter table public.curated_match_recommendations enable row level security;

drop policy if exists "Members read own curated match batches" on public.curated_match_batches;
create policy "Members read own curated match batches"
  on public.curated_match_batches
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Members read own curated match recommendations" on public.curated_match_recommendations;
create policy "Members read own curated match recommendations"
  on public.curated_match_recommendations
  for select
  to authenticated
  using (user_id = (select auth.uid()));
