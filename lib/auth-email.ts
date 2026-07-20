/**
 * Auth email confirmation behavior differs by environment:
 * - Local Supabase (config.toml): enable_confirmations = false — sign-in works without
 *   confirming; auth emails are captured in Inbucket at http://127.0.0.1:54324
 * - Production Supabase: enable confirmations in the dashboard; use custom SMTP or
 *   Supabase's mailer. App transactional mail uses Resend (RESEND_API_KEY).
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
    return `Account created.${inboxHint} Sign in to start your membership application.`
  }
  return 'Account created. Check your email to confirm your address, then sign in to start your membership application.'
}

export function welcomeEmailConfirmationParagraph(): string {
  if (!isAuthEmailConfirmationRequired()) {
    return '<p>In this environment you can sign in right away. When email confirmation is enabled in production, members confirm via the link Supabase sends.</p>'
  }
  return '<p>Confirm your email using the link Supabase sent, then sign in to start your membership application.</p>'
}
