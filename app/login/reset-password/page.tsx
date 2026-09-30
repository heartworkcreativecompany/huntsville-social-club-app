import Link from 'next/link'
import { cookies } from 'next/headers'
import AuthPageShell from '@/components/auth/auth-page-shell'
import AuthStatusBanner from '@/components/auth/auth-status-banner'
import ResetPasswordForm from '@/app/login/reset-password/reset-password-form'
import {
  PASSWORD_RECOVERY_COOKIE,
  passwordRecoverySecret,
  recoveryAllowsPasswordUpdate,
  verifyPasswordRecoveryMarker,
} from '@/lib/password-recovery'
import { createClient } from '@/lib/supabase/server'

export default async function ResetPasswordPage() {
  const cookieStore = await cookies()
  const markerUserId = await verifyPasswordRecoveryMarker(
    cookieStore.get(PASSWORD_RECOVERY_COOKIE)?.value,
    passwordRecoverySecret()
  )
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const recoveryReady = recoveryAllowsPasswordUpdate(markerUserId, user?.id)

  if (!recoveryReady) {
    return (
      <AuthPageShell
        eyebrow="Members"
        title="Reset link unavailable"
        description="Password reset links are single-use and must be opened in the browser where they were requested."
        footer={
          <p className="text-center text-sm text-muted-foreground">
            <Link
              href="/login/forgot-password"
              className="font-medium text-accent underline"
            >
              Request a new reset link
            </Link>
          </p>
        }
      >
        <AuthStatusBanner variant="info" title="What to do next">
          This reset link is invalid, expired, or was opened in a different
          browser. Request a new password reset email and open the latest link
          in the same browser.
        </AuthStatusBanner>
      </AuthPageShell>
    )
  }

  return <ResetPasswordForm />
}
