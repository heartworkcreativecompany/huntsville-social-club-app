import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  createIdentityVerificationSession,
  markIdentitySessionPending,
} from '@/lib/stripe/identity'

export const runtime = 'nodejs'

export async function POST() {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: 'STRIPE_SECRET_KEY is not configured.' },
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
    .select('application_status, identity_verification_status')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found.' }, { status: 404 })
  }

  if (profile.identity_verification_status === 'verified') {
    return NextResponse.json(
      { error: 'Identity is already verified.' },
      { status: 400 }
    )
  }

  const applicationStatus = profile.application_status ?? 'draft'
  if (applicationStatus === 'draft' || applicationStatus === 'rejected') {
    return NextResponse.json(
      {
        error:
          'Submit your membership application before starting identity verification.',
      },
      { status: 400 }
    )
  }

  try {
    const session = await createIdentityVerificationSession({
      userId: user.id,
      email: user.email,
    })

    await markIdentitySessionPending(supabase, user.id, session.sessionId)

    return NextResponse.json({
      sessionId: session.sessionId,
      url: session.url,
      status: session.status,
    })
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to create Stripe Identity session.'
    console.error('Stripe Identity session creation failed:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
