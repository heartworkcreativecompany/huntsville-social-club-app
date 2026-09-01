-- Forward-only: submission version on profiles + queued audit lifecycle.
-- Does not alter application_status, timestamps, membership, billing, or
-- historic application_email_log rows. Does not apply itself.

alter table public.profiles
  add column if not exists application_submission_version integer not null default 0;

comment on column public.profiles.application_submission_version is
  'Server-owned count of draft|needs_info → submitted transitions. Starts at 0 for drafts; bumped only by profiles_bump_application_submission_version.';

alter table public.profiles
  drop constraint if exists profiles_application_submission_version_nonneg;

alter table public.profiles
  add constraint profiles_application_submission_version_nonneg
  check (application_submission_version >= 0);

-- Conservative backfill: non-draft applications already in the workflow become 1.
-- Draft rows stay at the default 0. Does not change status or other columns.
update public.profiles
set application_submission_version = 1
where application_submission_version = 0
  and application_status in (
    'submitted',
    'in_review',
    'needs_info',
    'approved',
    'rejected'
  );

create or replace function public.bump_application_submission_version()
returns trigger
language plpgsql
as $function$
begin
  -- Always ignore client-supplied version except the increment path below.
  new.application_submission_version := old.application_submission_version;

  if old.application_status is not distinct from new.application_status then
    return new;
  end if;

  if old.application_status in ('draft', 'needs_info')
    and new.application_status = 'submitted' then
    new.application_submission_version := old.application_submission_version + 1;
  end if;

  return new;
end;
$function$;

drop trigger if exists profiles_bump_application_submission_version
  on public.profiles;

create trigger profiles_bump_application_submission_version
before update of application_status on public.profiles
for each row
execute function public.bump_application_submission_version();

-- Add queued without rewriting historic delivery_status values.
alter table public.application_email_log
  drop constraint if exists application_email_log_delivery_status_check;

alter table public.application_email_log
  add constraint application_email_log_delivery_status_check
  check (
    delivery_status = any (
      array[
        'queued'::text,
        'sent'::text,
        'failed'::text,
        'skipped'::text,
        'bounced'::text
      ]
    )
  );
