-- Forward-only reconciliation of public.application_email_log.
-- Production already has this table (created outside Git) with live column
-- names resend_email_id, error_message, and provider_event.
-- Historical 20260828032531_create_application_email_log.sql cannot re-run:
-- CREATE TABLE IF NOT EXISTS skips, then COMMENT ON provider_email_id fails.
-- This file does not recreate the table, does not rewrite rows, and does not
-- add unused duplicate columns (provider_email_id, error_text, provider_metadata).
-- It does not alter profiles columns, triggers, or functions.
-- Marking 20260828032531 applied is a separate, explicitly approved history step.

alter table public.application_email_log
  drop constraint if exists application_email_log_application_id_fkey;

alter table public.application_email_log
  add constraint application_email_log_application_id_fkey
  foreign key (application_id) references public.profiles (id) on delete cascade;

alter table public.application_email_log
  drop constraint if exists application_email_log_recipient_user_id_fkey;

alter table public.application_email_log
  add constraint application_email_log_recipient_user_id_fkey
  foreign key (recipient_user_id) references public.profiles (id) on delete cascade;

alter table public.application_email_log
  drop constraint if exists application_email_log_event_key_check;

alter table public.application_email_log
  add constraint application_email_log_event_key_check
  check (length(trim(event_key)) > 0);

alter table public.application_email_log
  drop constraint if exists application_email_log_application_status_check;

alter table public.application_email_log
  add constraint application_email_log_application_status_check
  check (
    application_status = any (
      array[
        'draft'::text,
        'submitted'::text,
        'in_review'::text,
        'needs_info'::text,
        'approved'::text,
        'rejected'::text
      ]
    )
  );

-- Must include queued: the deployed Edge Function inserts delivery_status queued
-- before sent/failed. Do not restore the historical check that omitted queued.
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

create index if not exists application_email_log_created_idx
  on public.application_email_log (created_at desc);

create index if not exists application_email_log_recipient_idx
  on public.application_email_log (recipient_user_id, created_at desc);

drop trigger if exists set_application_email_log_updated_at
  on public.application_email_log;
create trigger set_application_email_log_updated_at
  before update on public.application_email_log
  for each row
  execute function public.set_updated_at();

alter table public.application_email_log enable row level security;

drop policy if exists "Admins read application email log"
  on public.application_email_log;
create policy "Admins read application email log"
  on public.application_email_log
  for select
  to authenticated
  using (public.is_admin((select auth.uid())));

-- No insert/update/delete policies for authenticated or anon.
-- Writes are service-role only (bypasses RLS). Applicants have no access.
revoke all on public.application_email_log from anon, authenticated;
grant select on public.application_email_log to authenticated;
grant all on public.application_email_log to service_role;

comment on column public.application_email_log.resend_email_id is
  'Provider message id only. Not a callback URL or API token.';
comment on column public.application_email_log.error_message is
  'Short safe delivery error. Must not store raw provider dumps.';
comment on column public.application_email_log.provider_event is
  'Redacted provider metadata (status codes, retry counts). Must not store unredacted payloads, bodies, or secrets.';
