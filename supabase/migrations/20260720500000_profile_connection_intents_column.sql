-- connection_intents is a NEW canonical column on public.profiles.
-- It is NOT a rename of connections_open_to; that column remains for display-only labels.
-- This migration must run before member_profiles references connection_intents.

alter table public.profiles
  add column if not exists connection_intents text[] not null default '{}';

comment on column public.profiles.connection_intents is
  'Canonical connection intent categories (networking, dating, friends). Drives directory filters and badges.';

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
