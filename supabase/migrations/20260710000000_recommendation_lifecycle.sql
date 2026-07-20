-- Recommendation lifecycle: expiry timestamps, partial unique pair index, member updates.

alter table public.curated_match_recommendations
  add column if not exists expires_at timestamptz,
  add column if not exists lifecycle_updated_at timestamptz not null default now();

update public.curated_match_recommendations
set
  expires_at = created_at + interval '30 days',
  lifecycle_updated_at = coalesce(lifecycle_updated_at, created_at)
where expires_at is null;

alter table public.curated_match_recommendations
  alter column expires_at set default (now() + interval '30 days');

comment on column public.curated_match_recommendations.expires_at is
  'When this recommendation expires if still pending or viewed.';
comment on column public.curated_match_recommendations.lifecycle_updated_at is
  'Last member or system lifecycle transition (viewed, passed, expired, etc.).';

alter table public.curated_match_recommendations
  drop constraint if exists curated_match_recommendations_user_id_recommended_user_id_key;

create unique index if not exists curated_match_recommendations_active_pair_idx
  on public.curated_match_recommendations (user_id, recommended_user_id)
  where status in ('pending', 'viewed', 'accepted');

create index if not exists curated_match_recommendations_expires_idx
  on public.curated_match_recommendations (expires_at)
  where status in ('pending', 'viewed');

drop policy if exists "Members update own recommendation lifecycle"
  on public.curated_match_recommendations;
create policy "Members update own recommendation lifecycle"
  on public.curated_match_recommendations
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
