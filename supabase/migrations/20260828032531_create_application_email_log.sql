-- Private application email delivery log.
-- Membership applications live on public.profiles (id uuid PK = auth user id),
-- not a separate applications table. This log is admin-readable and
-- service-role writable. It must not store email bodies, tokens, callback URLs,
-- full application drafts, verification materials, reviewer notes, or raw
-- provider payloads.

create table if not exists public.application_email_log (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.profiles (id) on delete cascade,
  recipient_user_id uuid not null references public.profiles (id) on delete cascade,
  recipient_email text not null,
  event_key text not null,
  application_status text not null,
  provider_email_id text,
  delivery_status text not null,
  error_text text,
  provider_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint application_email_log_application_id_event_key_key
    unique (application_id, event_key),
  constraint application_email_log_event_key_check
    check (length(trim(event_key)) > 0),
  constraint application_email_log_application_status_check
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
    ),
  constraint application_email_log_delivery_status_check
    check (
      delivery_status = any (
        array[
          'sent'::text,
          'failed'::text,
          'skipped'::text,
          'bounced'::text
        ]
      )
    )
);

comment on table public.application_email_log is
  'Private, idempotent log of membership-application email delivery. Admin read only. Never stores email body, auth tokens, callback URLs, application drafts, verification materials, reviewer notes, or unredacted provider payloads. application_id is profiles.id.';
comment on column public.application_email_log.application_id is
  'profiles.id of the membership application. There is no separate applications table.';
comment on column public.application_email_log.recipient_user_id is
  'Authenticated recipient (typically the applicant). Same uuid type as profiles.id.';
comment on column public.application_email_log.recipient_email is
  'Address the message was sent to. Not the email body.';
comment on column public.application_email_log.event_key is
  'Idempotency key for one email event per application, e.g. application_submitted.';
comment on column public.application_email_log.application_status is
  'Snapshot of profiles.application_status at send time.';
comment on column public.application_email_log.provider_email_id is
  'Provider message id only. Not a callback URL or API token.';
comment on column public.application_email_log.error_text is
  'Short safe delivery error. Must not store raw provider dumps.';
comment on column public.application_email_log.provider_metadata is
  'Redacted provider metadata (status codes, retry counts). Must not store unredacted payloads, bodies, or secrets.';

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
