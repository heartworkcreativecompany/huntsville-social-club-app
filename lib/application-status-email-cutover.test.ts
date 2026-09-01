import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = process.cwd()

function readRepoFile(relativePath: string) {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8')
}

const submitAction = readRepoFile('app/(club)/application/actions.ts')
const adminAction = readRepoFile('app/(club)/admin/applications/actions.ts')
const helpers = readRepoFile('lib/transactional-email.ts')
const signup = readRepoFile('app/signup/page.tsx')
const profileRevisionActions = readRepoFile(
  'app/(club)/admin/profile-revisions/actions.ts'
)
const membersActions = readRepoFile('app/(club)/members/actions.ts')

const CUTOVER_COMMENT =
  'Applicant status email delivery is handled by the Supabase application-status-email webhook pipeline after production activation.'

const APPLICANT_STATUS_SENDERS = [
  'sendApplicationSubmittedEmail',
  'sendApplicationApprovedEmail',
  'sendApplicationRejectedEmail',
  'sendApplicationNeedsInfoEmail',
] as const

describe('applicant-status email cutover', () => {
  it('keeps submit and admin status updates while dropping direct applicant-status email calls', () => {
    expect(submitAction).toContain('export async function submitApplication')
    expect(submitAction).toContain("application_status: 'submitted'")
    expect(submitAction).toContain("return { success: true as const }")
    expect(submitAction).toContain(CUTOVER_COMMENT)

    expect(adminAction).toContain('export async function updateApplicationStatus')
    expect(adminAction).toContain('application_status: status')
    expect(adminAction).toContain("return { success: true as const }")
    expect(adminAction).toContain(CUTOVER_COMMENT)

    expect(adminAction).toContain(
      "return updateApplicationStatus(applicantId, 'approved', undefined)"
    )
    expect(adminAction).toContain(
      "return updateApplicationStatus(applicantId, 'rejected', notes)"
    )
    expect(adminAction).toContain(
      "return updateApplicationStatus(applicantId, 'needs_info', notes)"
    )

    for (const sender of APPLICANT_STATUS_SENDERS) {
      expect(submitAction).not.toContain(sender)
      expect(adminAction).not.toContain(sender)
    }
  })

  it('preserves the unused Next.js applicant-status email helpers', () => {
    expect(helpers).toContain('export async function sendApplicationSubmittedEmail')
    expect(helpers).toContain('export async function sendApplicationApprovedEmail')
    expect(helpers).toContain('export async function sendApplicationRejectedEmail')
    expect(helpers).toContain('export async function sendApplicationNeedsInfoEmail')
  })

  it('does not disable unrelated transactional emails', () => {
    expect(signup).toContain('sendWelcomeEmail')
    expect(membersActions).toContain('sendProfileRevisionSubmittedEmail')
    expect(profileRevisionActions).toContain('sendProfileRevisionApprovedEmail')
  })
})
