import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = process.cwd()

function readRepoFile(relativePath: string) {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8')
}

const signup = readRepoFile('app/signup/page.tsx')
const transactional = readRepoFile('lib/transactional-email.ts')
const authEmail = readRepoFile('lib/auth-email.ts')
const statusHandler = readRepoFile(
  'supabase/functions/application-status-email/handler.ts'
)
const statusIndex = readRepoFile(
  'supabase/functions/application-status-email/index.ts'
)

const WELCOME_MARKERS = [
  'sendWelcomeEmail',
  'welcomeEmailConfirmationParagraph',
  'Welcome — confirm your email',
  'Welcome to Huntsville Social Club',
  'separate from this welcome note',
] as const

const APPLICANT_STATUS_SENDERS = [
  'sendApplicationSubmittedEmail',
  'sendApplicationApprovedEmail',
  'sendApplicationRejectedEmail',
  'sendApplicationNeedsInfoEmail',
] as const

describe('signup branded welcome email removal', () => {
  it('keeps Supabase Auth signup and confirmation redirect unchanged', () => {
    expect(signup).toContain('await supabase.auth.signUp({')
    expect(signup).toContain('email: trimmedEmail')
    expect(signup).toContain('emailRedirectTo: authCallbackUrl(returnPath ?? \'/login?confirmed=1\')')
    expect(signup).toContain('accountCreatedSuccessMessage()')
    expect(signup).toContain("trackEvent('auth_account_created')")
  })

  it('does not invoke, import, or generate the branded welcome email on signup', () => {
    for (const marker of WELCOME_MARKERS) {
      expect(signup).not.toContain(marker)
    }
    expect(signup).not.toContain("from '@/lib/transactional-email'")
  })

  it('removes the welcome-email sender without disabling other transactional mail', () => {
    for (const marker of WELCOME_MARKERS) {
      expect(transactional).not.toContain(marker)
    }
    for (const sender of APPLICANT_STATUS_SENDERS) {
      expect(transactional).toContain(`export async function ${sender}`)
    }
    expect(transactional).toContain('export async function sendProfileRevisionSubmittedEmail')
    expect(transactional).toContain('export async function sendCuratedMatchesDeliveredEmail')
  })

  it('does not send welcome mail from the application-status Edge Function', () => {
    expect(statusHandler).not.toContain('sendWelcomeEmail')
    expect(statusIndex).not.toContain('sendWelcomeEmail')
    expect(statusHandler).not.toContain('Welcome — confirm your email')
    expect(statusHandler).toContain('application_submitted')
    expect(statusHandler).toContain('application_approved')
  })

  it('preserves Auth confirmation copy helpers used by signup and login', () => {
    expect(authEmail).toContain('export function isAuthEmailConfirmationRequired')
    expect(authEmail).toContain('export function accountCreatedSuccessMessage')
    expect(authEmail).not.toContain('welcomeEmailConfirmationParagraph')
    expect(authEmail).not.toContain('separate from this welcome note')
  })
})
