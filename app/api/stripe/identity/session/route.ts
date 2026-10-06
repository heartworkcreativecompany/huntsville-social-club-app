import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { startMemberIdentityVerification } from '@/lib/stripe/identity'
import { isStripeIdentityConfigured } from '@/lib/stripe/config'

export const runtime = 'nodejs'

/**
 * Creates a Stripe Identity VerificationSession for the member-facing
 * "Identity & location verification" step. Outcomes are applied via webhook
 * (`applyIdentityVerificationSession`).
 *
 * Requires STRIPE_SECRET_KEY and NEXT_PUBLIC_APP_URL (return URL).
 * Supabase Auth email/phone config is unrelated to this route.
 */
export async function POST() {
  if (!isStripeIdentityConfigured()) {
    return NextResponse.json(
      {
        error:
          'Identity verification is not configured. Set STRIPE_SECRET_KEY and NEXT_PUBLIC_APP_URL.',
      },
      { status: 503 }
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'application_status, identity_verification_status, identity_verification_session_id'
    )
    .eq('id', user.id)
    .maybeSingle()

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found.' }, { status: 404 })
  }

  try {
    const result = await startMemberIdentityVerification({
      supabase,
      userId: user.id,
      email: user.email,
      applicationStatus: profile.application_status,
      identityStatus: profile.identity_verification_status,
      storedSessionId: profile.identity_verification_session_id,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.httpStatus })
    }

    return NextResponse.json({
      sessionId: result.sessionId,
      url: result.url,
      status: result.status,
    })
  } catch {
    console.error('[identity] verification status refresh failed')
    return NextResponse.json(
      { error: 'Could not start identity verification. Please try again.' },
      { status: 500 }
    )
  }
}
