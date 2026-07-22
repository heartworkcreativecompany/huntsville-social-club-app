/**
 * Auth email confirmation behavior differs by environment:
 * - Local Supabase (config.toml): enable_confirmations = false — sign-in works without
 *   confirming; auth emails are captured in Inbucket at http://127.0.0.1:54324
 * - Hosted Supabase (staging/prod): confirmation is controlled in the Dashboard
 *   (Authentication → Providers → Email). Confirmation emails are sent by
 *   **Supabase Auth** (built-in mailer or custom SMTP) — not by Resend.
 * - Resend (RESEND_API_KEY) is only for app transactional mail (welcome, approvals, etc.)
 *   and does not deliver the Auth confirmation link.
 */

export function isAuthEmailConfirmationRequired(): boolean {
  const override = process.env.NEXT_PUBLIC_AUTH_EMAIL_CONFIRMATION_REQUIRED
  if (override === 'true') return true
  if (override === 'false') return false
  return process.env.NODE_ENV === 'production'
}

/** Local Inbucket URL when using `supabase start` (auth confirmation emails). */
export function localAuthEmailInboxUrl(): string | null {
  if (process.env.NODE_ENV === 'production') return null
  return process.env.NEXT_PUBLIC_SUPABASE_INBUCKET_URL ?? 'http://127.0.0.1:54324'
}

export function accountCreatedSuccessMessage(): string {
  if (!isAuthEmailConfirmationRequired()) {
    const inbox = localAuthEmailInboxUrl()
    const inboxHint = inbox
      ? ` If you are running Supabase locally, auth emails (if any) appear in Inbucket at ${inbox} — confirmation is not required to sign in during local development.`
      : ' Email confirmation is not required to sign in in this environment.'
    return `Account created.${inboxHint} Sign in to start your membership application. If your hosted Supabase project still requires confirmation, use Resend confirmation email on the sign-in page.`
  }
  return 'Account created. Check your email for the Supabase confirmation link, then sign in. If it does not arrive, use Resend confirmation email on the sign-in page (check spam).'
}

export function welcomeEmailConfirmationParagraph(): string {
  if (!isAuthEmailConfirmationRequired()) {
    return '<p>In this environment you can usually sign in right away. If your Supabase project requires email confirmation, use the confirmation link Supabase sends (or Resend confirmation on the sign-in page).</p>'
  }
  return '<p>Confirm your email using the link Supabase Auth sent (separate from this welcome note), then sign in to start your membership application.</p>'
}
