import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleResendContactWebhook } from '@/lib/resend-contact-webhook'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const rawBody = await request.text()
  const admin = createAdminClient()

  try {
  const result = await handleResendContactWebhook({
    rawBody,
    svixId: request.headers.get('svix-id'),
    svixTimestamp: request.headers.get('svix-timestamp'),
    svixSignature: request.headers.get('svix-signature'),
    secret: process.env.RESEND_WEBHOOK_SECRET,
    applyUnsubscribe: async (email, svixId) => {
      if (!admin) {
        throw new Error('Admin client unavailable.')
      }
      const { data, error } = await admin.rpc('apply_resend_contact_unsubscribe', {
        target_email: email,
        provider_event_id: svixId,
      })
      if (error) throw new Error('unsubscribe_failed')
      return data === 'duplicate' ? 'duplicate' : 'applied'
    },
    recordDelivery: async (svixId, eventType) => {
      if (!admin) {
        throw new Error('Admin client unavailable.')
      }
      const { data, error } = await admin.rpc('record_resend_webhook_delivery', {
        provider_event_id: svixId,
        provider_event_type: eventType,
      })
      if (error) throw new Error('delivery_record_failed')
      return data === 'duplicate' ? 'duplicate' : 'new'
    },
  })

  return NextResponse.json(result.body, { status: result.status })
  } catch {
    return NextResponse.json({ error: 'Could not process webhook.' }, { status: 500 })
  }
}
