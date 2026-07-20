-- Auto-triggered curated match generation sources.

alter table public.curated_match_batches
  drop constraint if exists curated_match_batches_generation_source_check;

alter table public.curated_match_batches
  add constraint curated_match_batches_generation_source_check
  check (
    generation_source is null
    or generation_source = any (
      array[
        'scheduled'::text,
        'manual_all'::text,
        'manual_member'::text,
        'dev_seed'::text,
        'auto_questionnaire'::text,
        'auto_dating'::text,
        'auto_entitlement'::text,
        'auto_approval'::text
      ]
    )
  );
