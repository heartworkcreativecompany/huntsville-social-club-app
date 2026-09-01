import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = process.cwd()

function readRepoFile(relativePath: string) {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8')
}

const versionSql = readRepoFile(
  'supabase/migrations/20260901010000_add_application_submission_version_and_email_queue_state.sql'
)
const originalLogSql = readRepoFile(
  'supabase/migrations/20260828032531_create_application_email_log.sql'
)
const workflowSql = readRepoFile(
  'supabase/migrations/20260522140000_member_application_workflow.sql'
)
const submitAction = readRepoFile('app/(club)/application/actions.ts')
const adminAction = readRepoFile('app/(club)/admin/applications/actions.ts')
const applicationLib = readRepoFile('lib/application.ts')
const handler = readRepoFile(
  'supabase/functions/application-status-email/handler.ts'
)

describe('application submission version migration', () => {
  it('adds a non-negative integer column defaulting to 0', () => {
    expect(versionSql).toContain(
      'add column if not exists application_submission_version integer not null default 0'
    )
    expect(versionSql).toContain(
      'drop constraint if exists profiles_application_submission_version_nonneg'
    )
    expect(versionSql).toContain(
      'add constraint profiles_application_submission_version_nonneg'
    )
    expect(versionSql).toContain('check (application_submission_version >= 0)')
  })

  it('backfills only non-draft version-0 rows to 1 and leaves other profile data alone', () => {
    const backfill = versionSql.match(
      /update public\.profiles[\s\S]*?;/
    )?.[0]
    expect(backfill).toBeTruthy()
    expect(backfill).toMatch(
      /set application_submission_version = 1\s+where application_submission_version = 0/
    )
    expect(backfill).toContain("'submitted'")
    expect(backfill).toContain("'in_review'")
    expect(backfill).toContain("'needs_info'")
    expect(backfill).toContain("'approved'")
    expect(backfill).toContain("'rejected'")
    expect(backfill).not.toContain("'draft'")
    expect(versionSql).not.toMatch(/\bset\s+application_status\s*=/)
    expect(versionSql).not.toMatch(/application_submitted_at\s*=/)
    expect(versionSql).not.toMatch(/membership_billing/)
  })

  it('increments only on draft|needs_info → submitted and overrides client-supplied versions', () => {
    expect(versionSql).toContain(
      'create or replace function public.bump_application_submission_version()'
    )
    expect(versionSql).toContain(
      'drop trigger if exists profiles_bump_application_submission_version'
    )
    expect(versionSql).toContain(
      'create trigger profiles_bump_application_submission_version'
    )
    const bumpFn = versionSql.match(
      /create or replace function public\.bump_application_submission_version\(\)[\s\S]*?\$function\$;/
    )?.[0]
    expect(bumpFn).toBeTruthy()
    expect(bumpFn).toContain(
      'new.application_submission_version := old.application_submission_version;'
    )
    expect(bumpFn).toContain(
      "if old.application_status in ('draft', 'needs_info')"
    )
    expect(bumpFn).toContain("and new.application_status = 'submitted' then")
    expect(bumpFn).toContain(
      'new.application_submission_version := old.application_submission_version + 1;'
    )
    expect(bumpFn).not.toMatch(
      /application_status in \('in_review'|application_status = 'in_review'|application_status = 'approved'|application_status = 'rejected'/
    )
    expect(workflowSql).toContain('guard_profile_application_status')
    expect(workflowSql).toContain(
      "Rejected applications must be revised as a draft first"
    )
    expect(versionSql).not.toContain('guard_profile_application_status')
  })

  it('adds queued to the existing delivery_status check without rewriting historic rows', () => {
    expect(originalLogSql).toContain(
      'constraint application_email_log_delivery_status_check'
    )
    expect(originalLogSql).not.toContain("'queued'")
    expect(versionSql).toContain(
      'drop constraint if exists application_email_log_delivery_status_check'
    )
    expect(versionSql).toContain("'queued'::text")
    expect(versionSql).toContain("'sent'::text")
    expect(versionSql).toContain("'failed'::text")
    expect(versionSql).toContain("'skipped'::text")
    expect(versionSql).toContain("'bounced'::text")
    expect(versionSql).not.toMatch(
      /update public\.application_email_log/i
    )
  })
})

describe('application status email send paths', () => {
  it('identifies existing Next.js Resend email senders rather than removing them', () => {
    expect(submitAction).toContain('sendApplicationSubmittedEmail')
    expect(adminAction).toContain('sendApplicationApprovedEmail')
    expect(adminAction).toContain('sendApplicationRejectedEmail')
    expect(adminAction).toContain('sendApplicationNeedsInfoEmail')
    expect(handler).toContain('RESEND_EVENTS_URL')
    expect(handler).toContain('https://api.resend.com/events/send')
  })

  it('keeps member submit limited to draft or needs_info', () => {
    expect(applicationLib).toMatch(
      /canSubmitApplication[\s\S]*status === 'draft' \|\| status === 'needs_info'/
    )
    expect(submitAction).toContain("application_status: 'submitted'")
    expect(submitAction).toContain('canSubmitApplication(status)')
  })
})
