import { NextResponse } from 'next/server'
import { createMembershipCheckoutSession } from '@/app/(club)/membership/actions'

export const runtime = 'nodejs'

function statusForCheckoutError(message: string): number {
  if (message === 'You must be signed in.') return 401
  if (message === 'Membership approval is required before upgrading.') return 403
  if (message === 'Stripe billing is not configured yet.') return 503
  return 400
}

export async function POST(request: Request) {
  let tier: unknown
  try {
    const body = (await request.json()) as { tier?: unknown }
    tier = body.tier
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  if (typeof tier !== 'string' || !tier.trim()) {
    return NextResponse.json(
      { error: 'Invalid membership plan selected.' },
      { status: 400 }
    )
  }

  const result = await createMembershipCheckoutSession(tier)

  if (result.error) {
    return NextResponse.json(
      { error: result.error },
      { status: statusForCheckoutError(result.error) }
    )
  }

  if (!result.url) {
    return NextResponse.json(
      { error: 'Could not start checkout.' },
      { status: 500 }
    )
  }

  return NextResponse.json({ url: result.url })
}
