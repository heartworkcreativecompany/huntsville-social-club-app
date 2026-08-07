-- event_attendees was created without updated_at, but a BEFORE UPDATE
-- trigger (set_event_attendees_updated_at → public.set_updated_at) already
-- assigns NEW.updated_at. Updates failed with:
--   record "new" has no field "updated_at"
-- (e.g. Not going → Going, or clearing unpaid Going placeholders).

alter table public.event_attendees
  add column if not exists updated_at timestamptz;

update public.event_attendees
set updated_at = coalesce(created_at, now())
where updated_at is null;

alter table public.event_attendees
  alter column updated_at set default now();

alter table public.event_attendees
  alter column updated_at set not null;

comment on column public.event_attendees.updated_at is
  'Maintained by set_event_attendees_updated_at (public.set_updated_at) on UPDATE.';

-- Recreate trigger so local/fresh DBs stay consistent with remote_schema.
drop trigger if exists set_event_attendees_updated_at on public.event_attendees;

create trigger set_event_attendees_updated_at
  before update on public.event_attendees
  for each row
  execute function public.set_updated_at();
