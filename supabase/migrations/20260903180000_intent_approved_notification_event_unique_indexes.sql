-- Unique indexes for intent-approved notifications keyed by a stable
-- profile-revision submit UUID (metadata.intent_event_id).
-- One notification per genuine intent-addition event, independent of read_at.
-- A later remove-and-re-add uses a new revision UUID and may notify again.
-- Historical rows with metadata '{}' are excluded and left untouched.
-- Unrelated notification types are not indexed.

-- Preflight (do not run against production from this file).
-- Aggregate only: no user ids, titles, bodies, or hrefs.
--
-- select
--   type,
--   count(*) as duplicate_groups,
--   coalesce(sum(row_count - 1), 0) as extra_rows
-- from (
--   select
--     type,
--     count(*) as row_count
--   from public.member_notifications
--   where type in ('dating_intent_approved', 'friendship_intent_approved')
--     and nullif(metadata->>'intent_event_id', '') is not null
--   group by type, user_id, metadata->>'intent_event_id'
--   having count(*) > 1
-- ) duplicates
-- group by type;
--
-- Apply only if extra_rows is 0.

create unique index if not exists member_notifications_dating_intent_event_unique
  on public.member_notifications (user_id, (metadata->>'intent_event_id'))
  where type = 'dating_intent_approved'
    and nullif(metadata->>'intent_event_id', '') is not null;

create unique index if not exists member_notifications_friendship_intent_event_unique
  on public.member_notifications (user_id, (metadata->>'intent_event_id'))
  where type = 'friendship_intent_approved'
    and nullif(metadata->>'intent_event_id', '') is not null;
