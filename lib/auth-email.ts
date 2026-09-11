/**
 * Auth email confirmation behavior differs by environment:
 * - Local Supabase (config.toml): enable_confirmations = false — sign-in works without
 *   confirming; auth emails are captured in Inbucket at http://127.0.0.1:54324
 * - Hosted Supabase (staging/prod): confirmation is controlled in the Dashboard
 *   (Authentication → Providers → Email). Confirmation emails are sent by
 *   **Supabase Auth** (built-in mailer or custom SMTP) — not by Resend.
 * - Resend (RESEND_API_KEY) is only for app transactional mail (application-status,
 *   profile, messaging, etc.) and does not deliver the Auth confirmation link.
 *   Signup does not send a separate branded welcome email.
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
