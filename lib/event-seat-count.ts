import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Seats already taken for an event: confirmed member RSVPs plus paid guests
 * and guest holds that have not expired. Service role only.
 */
export async function loadEventTakenSeatCount(
  eventId: string
): Promise<number | null> {
  const admin = createAdminClient()
  if (!admin) return null

  const { data, error } = await admin.rpc('event_taken_seat_count', {
    p_event_id: eventId,
  })
  if (error || data == null) return null

  const count = typeof data === 'number' ? data : Number(data)
  if (!Number.isFinite(count)) return null
  return count
}
