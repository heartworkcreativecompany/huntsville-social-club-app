-- Separate staff-declined recommendations from member-passed outcomes.

alter table public.curated_match_recommendations
  drop constraint if exists curated_match_recommendations_status_check;

alter table public.curated_match_recommendations
  add constraint curated_match_recommendations_status_check
  check (status = any (array[
    'pending'::text,
    'viewed'::text,
    'accepted'::text,
    'passed'::text,
    'declined'::text,
    'expired'::text
  ]));

-- Backfill staff declines that were incorrectly stored as passed.
update public.curated_match_recommendations r
set status = 'declined'
from public.member_intro_requests i
where i.recommendation_id = r.id
  and i.status = 'declined'
  and r.status = 'passed';
