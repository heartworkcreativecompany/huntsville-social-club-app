import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = process.cwd()

function readMigration(name: string) {
  return readFileSync(resolve(repoRoot, 'supabase/migrations', name), 'utf8')
}

const historicalSql = readMigration(
  '20260828032531_create_application_email_log.sql'
)
const reconcileSql = readMigration(
  '20260910020000_reconcile_application_email_log.sql'
)
const versionSql = readMigration(
  '20260901010000_add_application_submission_version_and_email_queue_state.sql'
)
const rsvpQuestionSql = readMigration(
  '20260910000000_event_rsvp_question.sql'
)
const rsvpPendingSql = readMigration(
  '20260910010000_event_rsvp_pending_answers.sql'
)
const workflowSql = readMigration(
  '20260522140000_member_application_workflow.sql'
)
const handler = readFileSync(
  resolve(
    repoRoot,
    'supabase/functions/application-status-email/handler.ts'
  ),
  'utf8'
)

const STALE_COLUMNS = [
  'provider_email_id',
  'error_text',
  'provider_metadata',
] as const

const LIVE_COLUMNS = [
  'resend_email_id',
  'error_message',
  'provider_event',
] as const

describe('application email log reconciliation migration', () => {
  it('leaves the historical create migration untouched and incompatible', () => {
    expect(historicalSql).toContain('create table if not exists public.application_email_log')
    for (const column of STALE_COLUMNS) {
      expect(historicalSql).toContain(column)
    }
    expect(historicalSql).not.toContain('resend_email_id')
    expect(historicalSql).not.toContain('error_message')
    expect(historicalSql).not.toContain('provider_event')
    expect(historicalSql).toMatch(
      /constraint application_email_log_delivery_status_check[\s\S]*'sent'::text/
    )
    expect(historicalSql).not.toMatch(
      /constraint application_email_log_delivery_status_check[\s\S]*'queued'/
    )
  })

  it('uses live Production column names and does not add stale duplicates', () => {
    for (const column of LIVE_COLUMNS) {
      expect(reconcileSql).toContain(`public.application_email_log.${column}`)
    }
    const executableSql = reconcileSql
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n')
    for (const column of STALE_COLUMNS) {
      expect(executableSql).not.toContain(column)
      expect(reconcileSql).not.toContain(
        `comment on column public.application_email_log.${column}`
      )
      expect(reconcileSql).not.toMatch(
        new RegExp(`add column[^;]*\\b${column}\\b`, 'i')
      )
    }
    expect(executableSql).not.toMatch(/create table/i)
    expect(executableSql).not.toMatch(/drop table/i)
    expect(executableSql).not.toMatch(/rename column/i)
    expect(executableSql).not.toMatch(
      /alter table public\.application_email_log[\s\S]*add column/i
    )
    expect(handler).toContain('resend_email_id:')
    expect(handler).toContain('error_message:')
    expect(handler).toContain('provider_event:')
    expect(handler).not.toMatch(
      /body:\s*JSON\.stringify\(\{[\s\S]*provider_email_id/
    )
  })

  it('adds a delivery_status check that includes queued', () => {
    expect(reconcileSql).toContain(
      'drop constraint if exists application_email_log_delivery_status_check'
    )
    expect(reconcileSql).toContain(
      'add constraint application_email_log_delivery_status_check'
    )
    expect(reconcileSql).toContain("'queued'::text")
    expect(reconcileSql).toContain("'sent'::text")
    expect(reconcileSql).toContain("'failed'::text")
    expect(reconcileSql).toContain("'skipped'::text")
    expect(reconcileSql).toContain("'bounced'::text")
    expect(versionSql).toContain("'queued'::text")
  })

  it('adds status and event_key checks matching the application workflow', () => {
    expect(workflowSql).toContain("'draft'::text")
    expect(workflowSql).toContain("'submitted'::text")
    expect(workflowSql).toContain("'in_review'::text")
    expect(workflowSql).toContain("'needs_info'::text")
    expect(workflowSql).toContain("'approved'::text")
    expect(workflowSql).toContain("'rejected'::text")
    expect(reconcileSql).toContain(
      'add constraint application_email_log_event_key_check'
    )
    expect(reconcileSql).toContain('check (length(trim(event_key)) > 0)')
    expect(reconcileSql).toContain(
      'add constraint application_email_log_application_status_check'
    )
    expect(reconcileSql).toContain("'draft'::text")
    expect(reconcileSql).toContain("'submitted'::text")
    expect(reconcileSql).toContain("'in_review'::text")
    expect(reconcileSql).toContain("'needs_info'::text")
    expect(reconcileSql).toContain("'approved'::text")
    expect(reconcileSql).toContain("'rejected'::text")
  })

  it('adds profile foreign keys, lookup indexes, and the updated_at trigger', () => {
    expect(reconcileSql).toContain(
      'add constraint application_email_log_application_id_fkey'
    )
    expect(reconcileSql).toContain(
      'add constraint application_email_log_recipient_user_id_fkey'
    )
    expect(reconcileSql).toContain(
      'foreign key (application_id) references public.profiles (id) on delete cascade'
    )
    expect(reconcileSql).toContain(
      'foreign key (recipient_user_id) references public.profiles (id) on delete cascade'
    )
    expect(reconcileSql).toContain(
      'create index if not exists application_email_log_created_idx'
    )
    expect(reconcileSql).toContain(
      'create index if not exists application_email_log_recipient_idx'
    )
    expect(reconcileSql).toContain('set_application_email_log_updated_at')
    expect(reconcileSql).toContain('execute function public.set_updated_at()')
  })

  it('scopes admin SELECT and does not grant broad member or anon write access', () => {
    expect(reconcileSql).toContain('enable row level security')
    expect(reconcileSql).toContain('Admins read application email log')
    expect(reconcileSql).toContain('for select')
    expect(reconcileSql).toContain('to authenticated')
    expect(reconcileSql).toContain(
      'using (public.is_admin((select auth.uid())))'
    )
    expect(reconcileSql).toContain(
      'revoke all on public.application_email_log from anon, authenticated'
    )
    expect(reconcileSql).toContain(
      'grant select on public.application_email_log to authenticated'
    )
    expect(reconcileSql).toContain(
      'grant all on public.application_email_log to service_role'
    )
    expect(reconcileSql).not.toMatch(
      /create policy[\s\S]*for (insert|update|delete)[\s\S]*application_email_log/
    )
    expect(reconcileSql).not.toMatch(/to anon/)
  })

  it('does not rewrite email-log rows or alter profiles / RSVP migrations', () => {
    expect(reconcileSql).not.toMatch(/update public\.application_email_log/i)
    expect(reconcileSql).not.toMatch(/delete from public\.application_email_log/i)
    expect(reconcileSql).not.toMatch(/insert into public\.application_email_log/i)
    expect(reconcileSql).not.toMatch(/alter table public\.profiles/i)
    expect(reconcileSql).not.toContain('bump_application_submission_version')
    expect(reconcileSql).not.toContain('rsvp_question')
    expect(reconcileSql).not.toContain('event_rsvp_pending_answers')
    expect(rsvpQuestionSql).toContain('add column if not exists rsvp_question')
    expect(rsvpPendingSql).toContain(
      'create table if not exists public.event_rsvp_pending_answers'
    )
  })
})
