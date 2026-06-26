import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { createAdminClient } from '@/lib/supabase/admin'

export async function hasProcessedStripeEvent(eventId: string): Promise<boolean> {
  const admin = createAdminClient()
  if (!admin) return false

  const { data } = await admin
    .from('stripe_webhook_events')
    .select('event_id')
    .eq('event_id', eventId)
    .maybeSingle()

  return Boolean(data)
}

export async function markStripeEventProcessed(
  eventId: string,
  eventType: string,
  client?: SupabaseClient<Database> | null
): Promise<void> {
  const supabase = client ?? createAdminClient()
  if (!supabase) {
    throw new Error('Admin client unavailable for webhook idempotency.')
  }

  const { error } = await supabase.from('stripe_webhook_events').insert({
    event_id: eventId,
    event_type: eventType,
  })

  if (error && error.code !== '23505') {
    throw new Error(error.message)
  }
}
