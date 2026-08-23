-- Private Friendship Compatibility Questionnaire + friend recommendation path.
-- Answers live in a dedicated table (own-row RLS). Not stored on
-- profiles.compatibility_questionnaire and not selected by directory queries.

create table if not exists public.friendship_questionnaires (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  version int not null,
  answers jsonb not null default '{}'::jsonb,
  status text not null default 'draft'
    check (status = any (array['draft'::text, 'submitted'::text])),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.friendship_questionnaires is
  'Private Friendship Compatibility Questionnaire answers. Own-row only — never directory or public profile.';

comment on column public.friendship_questionnaires.answers is
  'Versioned friendship questionnaire payload. Includes private weight preferences. Never exposed to other members.';

comment on column public.friendship_questionnaires.status is
  'draft = in-progress save; submitted = complete and eligible for friend matching.';

create index if not exists friendship_questionnaires_submitted_idx
  on public.friendship_questionnaires (user_id)
  where status = 'submitted' and completed_at is not null;

create table if not exists public.friendship_match_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'delivered'
    check (status = any (array[
      'processing'::text,
      'delivered'::text,
      'empty'::text
    ])),
  match_count int not null default 0,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);

create index if not exists friendship_match_batches_user_idx
  on public.friendship_match_batches (user_id, created_at desc);

create table if not exists public.friendship_match_recommendations (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.friendship_match_batches (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  recommended_user_id uuid not null references public.profiles (id) on delete cascade,
  compatibility_score numeric(5, 2) not null,
  score_breakdown jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status = any (array[
      'pending'::text,
      'viewed'::text,
      'passed'::text,
      'expired'::text
    ])),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, recommended_user_id),
  check (user_id <> recommended_user_id)
);

comment on column public.friendship_match_recommendations.compatibility_score is
  'Internal normalized 0–100 friendship score. Never shown as a raw percentage to members.';

create index if not exists friendship_match_recommendations_user_status_idx
  on public.friendship_match_recommendations (user_id, status, created_at desc);

alter table public.friendship_questionnaires enable row level security;
alter table public.friendship_match_batches enable row level security;
alter table public.friendship_match_recommendations enable row level security;

drop policy if exists "Members read own friendship questionnaire" on public.friendship_questionnaires;
create policy "Members read own friendship questionnaire"
  on public.friendship_questionnaires
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Members insert own friendship questionnaire" on public.friendship_questionnaires;
create policy "Members insert own friendship questionnaire"
  on public.friendship_questionnaires
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Members update own friendship questionnaire" on public.friendship_questionnaires;
create policy "Members update own friendship questionnaire"
  on public.friendship_questionnaires
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Members read own friendship match batches" on public.friendship_match_batches;
create policy "Members read own friendship match batches"
  on public.friendship_match_batches
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Members read own friendship match recommendations" on public.friendship_match_recommendations;
create policy "Members read own friendship match recommendations"
  on public.friendship_match_recommendations
  for select
  to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update on public.friendship_questionnaires to authenticated;
grant select on public.friendship_match_batches to authenticated;
grant select on public.friendship_match_recommendations to authenticated;

grant all on public.friendship_questionnaires to service_role;
grant all on public.friendship_match_batches to service_role;
grant all on public.friendship_match_recommendations to service_role;
