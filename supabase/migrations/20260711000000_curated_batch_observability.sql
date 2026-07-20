-- Batch observability: generation source, empty-batch context, notification outcomes.

alter table public.curated_match_batches
  add column if not exists generation_source text
    check (
      generation_source is null
      or generation_source = any (
        array[
          'scheduled'::text,
          'manual_all'::text,
          'manual_member'::text,
          'dev_seed'::text
        ]
      )
    ),
  add column if not exists empty_reason text,
  add column if not exists top_candidate_score numeric(5, 2),
  add column if not exists notification_status text
    check (
      notification_status is null
      or notification_status = any (
        array[
          'sent'::text,
          'skipped_no_email'::text,
          'skipped_empty'::text,
          'skipped_manual'::text,
          'failed'::text
        ]
      )
    ),
  add column if not exists notification_sent_at timestamptz;

comment on column public.curated_match_batches.generation_source is
  'How this batch was triggered: scheduled cron, manual admin run, or dev seed.';
comment on column public.curated_match_batches.empty_reason is
  'Human-readable explanation when status is empty.';
comment on column public.curated_match_batches.notification_status is
  'Outcome of the delivery notification email for this batch.';

create index if not exists curated_match_batches_created_idx
  on public.curated_match_batches (created_at desc);

drop policy if exists "Admins read all curated match batches" on public.curated_match_batches;
create policy "Admins read all curated match batches"
  on public.curated_match_batches
  for select
  to authenticated
  using (public.is_admin((select auth.uid())));

drop policy if exists "Admins read all curated match recommendations" on public.curated_match_recommendations;
create policy "Admins read all curated match recommendations"
  on public.curated_match_recommendations
  for select
  to authenticated
  using (public.is_admin((select auth.uid())));
