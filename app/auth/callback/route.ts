import { NextResponse } from 'next/server'
import { syncEmailApprovalGateForUser } from '@/lib/approval-gate-sync'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/home'
  const type = searchParams.get('type')

  if (!code) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent('auth_callback_failed')}`
    )
  }

  const supabase = await createClient()
  const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent('auth_callback_failed')}`
    )
  }

  if (sessionData.user?.email_confirmed_at) {
    await syncEmailApprovalGateForUser(
      supabase,
      sessionData.user.id,
      true
    )
  }

  if (type === 'recovery' || next.includes('reset-password')) {
    return NextResponse.redirect(`${origin}/login/reset-password`)
  }

  const destination = next.startsWith('/') ? next : `/${next}`
  return NextResponse.redirect(`${origin}${destination}`)
}
