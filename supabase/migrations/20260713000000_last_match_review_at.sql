-- Anchor empty-batch reviews for delivery cadence without conflating with successful delivery.

alter table public.profiles
  add column if not exists last_match_review_at timestamptz;

comment on column public.profiles.last_match_review_at is
  'When the member last completed a curated match review (empty or delivered). Used for review cadence. last_match_generation_at remains successful delivery only.';
