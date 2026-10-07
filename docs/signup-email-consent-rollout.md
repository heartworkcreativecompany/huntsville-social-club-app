# Signup email consent rollout

This change is three separate activations. Merging the branch does not enable
the hosted Auth hook, register the marketing sync schedule, or create a Resend
webhook.

## 1. Migration

Apply `supabase/migrations/20261007180000_signup_email_consent.sql` before the
new signup form is required.

The migration adds consent columns, column update grants, the consent guard,
and a non-rejecting `handle_new_user`. Existing accounts are not backfilled.
Sign-in is unchanged. Signup without the new metadata still creates an account
and stores no consent evidence.

Do not drop the columns to roll back. Disable the hook first if it was enabled.

## 2. Form deployment

Deploy the signup form that sends only
`essential_email_acknowledgement` and `email_marketing_opt_in`.
The essential checkbox starts unchecked. Marketing starts unchecked.
The form does not send a timestamp, source, or version.

The profile page can withdraw marketing after this deploy. Withdrawal only
sets marketing off. It cannot opt someone in.

Phone verification stays optional. The SMS consent checkbox is removed.
Historical `sms_marketing_*` rows stay. Inbound STOP still records an SMS
opt-out and does not change email consent. New SMS opt-in is not recorded.

## 3. Hook activation

Only after the form in step 2 is live, enable the Before User Created hook in
the hosted Auth configuration:

`pg-functions://postgres/public/hook_before_user_created`

The hook rejects account creation unless
`user_metadata.essential_email_acknowledgement` is JSON `true`.
A string `"true"` is rejected. Missing or false marketing does not reject
creation and does not record a marketing opt-in.

`supabase/config.toml` enables this hook for local development so the Auth
integration test can run. Do not treat that file as production activation.
Do not run `supabase config push` for this hook until this step.

Rollback: disable the hook. Leave the columns in place. Sign-in keeps working.

Dashboard or manual user creation that types the boolean into metadata can
pass the hook. That is not a supported procedure. This change adds no tool to
mint that metadata. `auth_signup` means the assertion was present at creation.
It is not proof a checkbox was rendered.

## Integration test baseline

`npm run test:integration:signup-consent` is the integration command.
It starts an isolated Postgres container and GoTrue, applies
`supabase/tests/signup-email-consent/baseline.sql`, then applies only
`supabase/migrations/20261007180000_signup_email_consent.sql`, and runs
`lib/signup-email-consent.integration.test.ts`.

That proves the new migration against a representative baseline. It does
not prove that the complete historical migration chain applies on an empty
database. The checked-in historical files are not rewritten.

A fresh replay of the full chain stops on these statements:

1. `supabase/migrations/20260522140000_member_application_workflow.sql`
   updates `public.profiles` where `role in ('admin', 'host')`.
   `profiles.role` is not added until
   `supabase/migrations/20260525162330_remote_schema.sql`.
   Postgres reports `column "role" does not exist` (42703).

2. The same file then creates policy "Members can view approved profiles"
   using `public.is_admin((select auth.uid()))`.
   `public.is_admin(uuid)` is created later, in
   `20260525162330_remote_schema.sql`, with argument name `check_user_id`.
   Postgres reports `function public.is_admin(uuid) does not exist` (42883).

3. `supabase/migrations/20260910020000_reconcile_application_email_log.sql`
   comments on `application_email_log.resend_email_id`,
   `error_message`, and `provider_event`.
   The earlier create migration names those columns
   `provider_email_id`, `error_text`, and `provider_metadata`.
   Postgres reports that `resend_email_id` does not exist (42703).

The baseline used by the integration tests is the Supabase Postgres image's `auth` schema, with `email_confirmed_at` added when that image only has `confirmed_at`, plus a
`public.profiles` table with `id`, `email`, `role`, and `full_name`, the
pre-change `handle_new_user` trigger, and a member self-update policy.
Production has the later profile columns and policies. The consent
migration adds its columns and grants on top of whichever profiles table
it finds. It does not require the skipped historical statements.

Those three historical failures remain unresolved. This rollout does not
rewrite the old migrations.

Signed-in manual testing of the profile withdrawal card and the phone
verification screen is still incomplete. The checks that ran read the
component source and the public signup form.

## Grants for later profile columns

The migration revokes table-level `UPDATE` on `public.profiles` from
`authenticated` and grants `UPDATE` only on the non-consent columns that
exist when it runs. A later migration that adds a member-writable profile
column must grant `UPDATE` on that column to `authenticated`. Table-level
`UPDATE` no longer covers new columns.

## Marketing sync, not yet scheduled

`/api/cron/email-marketing-sync` is not listed in `vercel.json`.
`/api/resend/webhook` is not registered with Resend by this change.
No scheduled worker and no registered webhook exist yet. The local
functions are not live subscription sync.

The route returns 401 when `CRON_SECRET` is missing or the bearer token
does not match. It returns 500 when the service-role client or
`RESEND_API_KEY` is missing, and it does not call Resend in those cases.

Enrollment is queued in two places. `handle_new_user` inserts a pending
`enroll` job when marketing metadata is JSON true and
`auth.users.email_confirmed_at` is already set. Otherwise the trigger
`enqueue_email_marketing_on_confirm` runs after `email_confirmed_at`
changes from null to a timestamp, and only if the profile is still opted
in and not withdrawn.

Do not send live contacts, messages, or webhook replays as part of rollout
until those are chosen separately.

Enrollment writes only the contact `unsubscribed` flag. It does not add
segments or topics. Each attempt rechecks email confirmation, current local
consent, and the provider unsubscribe state. Local withdrawal wins over a
queued enrollment.

## Internal limitation

Essential-email delivery is not verified against a marketing unsubscribe.
That remains a separate unresolved issue on PR #49. When application-status
contact sync omits `unsubscribed`, the provider default is unresolved. Do not
publish a promise that unsubscribing from news and offers leaves application,
account, or membership mail unaffected until that sending path is verified.
The public privacy page does not make that promise.

Hosted Auth hook activation, Resend webhook registration, and the marketing
sync worker are three further steps. None of them is turned on by merging
this branch or by the local `supabase/config.toml` hook entry.

## Proposed public wording

Publication date written into the privacy page: October 7, 2026.
That date is not live until this branch is deployed.

We send emails needed to manage your application, account, and membership,
such as confirmation, application status, and account security. Creating an
account requires you to acknowledge these messages. That acknowledgement is
not a request for news or offers.

You may separately choose: “Email me Huntsville Social Club news, event
announcements, and offers.” That choice is optional. If you do not select it,
we do not record a marketing opt-in. You can unsubscribe from news,
announcements, and offers.
