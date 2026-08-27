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

export const ACCOUNT_CREATED_CONFIRMATION_BODY =
  'Check your email for the confirmation link, then sign in once it\'s verified. If the email does not arrive, first check your spam folder then click on \u201CDidn\'t get a confirmation email?\u201D on the Sign In page.'

export function accountCreatedSuccessMessage(): string {
  return ACCOUNT_CREATED_CONFIRMATION_BODY
}

export function welcomeEmailConfirmationParagraph(): string {
  if (!isAuthEmailConfirmationRequired()) {
    return '<p>In this environment you can usually sign in right away. If your Supabase project requires email confirmation, use the confirmation link Supabase sends (or Resend confirmation on the sign-in page).</p>'
  }
  return '<p>Confirm your email using the link Supabase Auth sent (separate from this welcome note), then sign in to start your membership application.</p>'
}
