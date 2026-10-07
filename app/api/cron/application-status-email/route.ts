import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const RETRY_SECRET_HEADER = 'x-application-status-retry-secret'

function isAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false
  return request.headers.get('authorization') === `Bearer ${cronSecret}`
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const retrySecret = process.env.APPLICATION_STATUS_RETRY_SECRET?.trim() ?? ''
  const supabaseUrl = (
    process.env.SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    ''
  ).replace(/\/$/, '')
  if (!retrySecret || !supabaseUrl) {
    return NextResponse.json(
      { error: 'Application status retry worker is not configured.' },
      { status: 500 }
    )
  }

  const response = await fetch(
    `${supabaseUrl}/functions/v1/application-status-email`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [RETRY_SECRET_HEADER]: retrySecret,
      },
      body: JSON.stringify({ mode: 'retry' }),
    }
  )

  if (!response.ok) {
    return NextResponse.json(
      { error: 'Application status retry worker failed.' },
      { status: 502 }
    )
  }

  return NextResponse.json({ ok: true })
}
