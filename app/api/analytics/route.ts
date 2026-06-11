import { NextResponse } from 'next/server'

const ALLOWED = new Set([
  'auth_account_created',
  'auth_sign_in',
  'auth_sign_in_failed',
  'application_started',
  'application_draft_saved',
  'application_submitted',
  'application_approved',
  'member_profile_viewed',
])

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      event?: string
      props?: Record<string, string | number | boolean>
    }

    if (!body.event || !ALLOWED.has(body.event)) {
      return NextResponse.json({ ok: false }, { status: 400 })
    }

    if (process.env.NODE_ENV === 'development') {
      console.info('[analytics:api]', body.event, body.props ?? {})
    }

    try {
      const Sentry = await import('@sentry/nextjs')
      Sentry.addBreadcrumb({
        category: 'analytics',
        message: body.event,
        data: body.props,
        level: 'info',
      })
    } catch {
      // Sentry optional.
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }
}
