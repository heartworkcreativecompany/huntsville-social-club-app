import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = process.cwd()

function readMigration(name: string) {
  return readFileSync(resolve(repoRoot, 'supabase/migrations', name), 'utf8')
}

const sql = readMigration('20260828032531_create_application_email_log.sql')
const workflowSql = readMigration('20260522140000_member_application_workflow.sql')
const profilesSql = readMigration('20260521233447_remote_schema.sql')
const rlsSql = readMigration('20260528195345_fix_profiles_rls_recursion.sql')
const updatedAtSql = readMigration('20260525162330_remote_schema.sql')
const webhookSql = readMigration('20260602000000_stripe_webhook_events.sql')
const moderationSql = readMigration('20260708000000_messaging_suspension.sql')

describe('application email log schema conventions', () => {
  it('stores membership application status on profiles, not a separate applications table', () => {
    expect(workflowSql).toContain('alter table public.profiles')
    expect(workflowSql).toContain('add column if not exists application_status text')
    expect(profilesSql).toContain('create table "public"."profiles"')
    expect(profilesSql).toContain('"id" uuid not null')
    expect(profilesSql).toContain('PRIMARY KEY using index "profiles_pkey"')
    expect(profilesSql).toContain(
      'FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE'
    )
    expect(sql).not.toMatch(/references public\.applications/i)
    expect(sql).toContain('references public.profiles (id) on delete cascade')
  })

  it('matches profiles.id uuid types for application and recipient user columns', () => {
    expect(sql).toMatch(
      /application_id uuid not null references public\.profiles \(id\) on delete cascade/
    )
    expect(sql).toMatch(
      /recipient_user_id uuid not null references public\.profiles \(id\) on delete cascade/
    )
  })

  it('enforces idempotency and records only safe delivery fields', () => {
    expect(sql).toContain('unique (application_id, event_key)')
    expect(sql).toContain('recipient_email text not null')
    expect(sql).toContain('event_key text not null')
    expect(sql).toContain('application_status text not null')
    expect(sql).toContain('provider_email_id text')
    expect(sql).toContain('delivery_status text not null')
    expect(sql).toContain('error_text text')
    expect(sql).toContain('provider_metadata jsonb not null default')
    expect(sql).toContain('created_at timestamptz not null default now()')
    expect(sql).toContain('updated_at timestamptz not null default now()')
    expect(sql).not.toMatch(
      /\b(html|text_body|email_body|body_html|auth_token|access_token|callback_url|application_draft|admin_review_notes|verification_state)\b/
    )
    expect(sql).toContain('Never stores email body')
    expect(sql).toContain('unredacted provider payloads')
  })

  it('follows the existing updated_at trigger convention', () => {
    expect(updatedAtSql).toContain('CREATE OR REPLACE FUNCTION public.set_updated_at()')
    expect(sql).toContain('set_application_email_log_updated_at')
    expect(sql).toContain('execute function public.set_updated_at()')
  })
})

describe('application email log RLS', () => {
  it('uses the tested is_admin helper for admin-only reads', () => {
    expect(rlsSql).toContain(
      'create or replace function public.is_admin(check_user_id uuid)'
    )
    expect(moderationSql).toContain('public.is_admin((select auth.uid()))')
    expect(sql).toContain('enable row level security')
    expect(sql).toContain('Admins read application email log')
    expect(sql).toContain('for select')
    expect(sql).toContain('to authenticated')
    expect(sql).toContain('using (public.is_admin((select auth.uid())))')
  })

  it('grants no anonymous or applicant write access', () => {
    expect(sql).toContain(
      'revoke all on public.application_email_log from anon, authenticated'
    )
    expect(sql).toContain(
      'grant select on public.application_email_log to authenticated'
    )
    expect(sql).toContain(
      'grant all on public.application_email_log to service_role'
    )
    expect(sql).not.toMatch(
      /create policy[\s\S]*for (insert|update|delete)[\s\S]*application_email_log/
    )
    expect(sql).not.toMatch(/to anon/)
    expect(webhookSql).toContain('enable row level security')
    expect(webhookSql).toContain('No member policies')
  })
})
