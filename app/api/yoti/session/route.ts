import { NextResponse } from 'next/server'
import { createYotiVerificationSession } from '@/lib/yoti/create-verification-session'
import { isYotiConfigured } from '@/lib/yoti/config'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function POST() {
  if (!isYotiConfigured()) {
    return NextResponse.json(
      {
        error:
          'Yoti sandbox is not configured. Set YOTI_CLIENT_SDK_ID and YOTI_KEY_FILE_PATH.',
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

  try {
    const session = await createYotiVerificationSession(user.id)
    return NextResponse.json(session)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to create Yoti session.'
    console.error('Yoti session creation failed:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
