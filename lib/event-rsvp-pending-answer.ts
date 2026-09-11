import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
  RSVP_ANSWER_SAVE_FAILED_MESSAGE,
  isMissingPendingRsvpAnswerTableError,
  type PaidCheckoutPendingAnswerPlan,
} from '@/lib/event-rsvp-question'

const PENDING_TABLE = 'event_rsvp_pending_answers' as const

/**
 * Stage or clear a member’s own paid-checkout RSVP answer.
 * Hosts cannot read this table. Failure to upsert a required/nonblank
 * answer must block Stripe Checkout.
 */
export type PersistPaidCheckoutPendingAnswerResult =
  | { ok: true }
  | { error: string }

export async function persistPaidCheckoutPendingAnswer(
  supabase: SupabaseClient<Database>,
  input: {
    eventId: string
    userId: string
    plan: PaidCheckoutPendingAnswerPlan
  }
): Promise<PersistPaidCheckoutPendingAnswerResult> {
  if (input.plan.action === 'skip') {
    return { ok: true }
  }

  if (input.plan.action === 'clear') {
    const { error } = await supabase
      .from(PENDING_TABLE)
      .delete()
      .eq('event_id', input.eventId)
      .eq('user_id', input.userId)

    if (error && !isMissingPendingRsvpAnswerTableError(error)) {
      console.error('[event_rsvp_pending_answer] clear_failed')
    }
    return { ok: true }
  }

  const now = new Date().toISOString()
  const { error } = await supabase.from(PENDING_TABLE).upsert(
    {
      event_id: input.eventId,
      user_id: input.userId,
      rsvp_answer: input.plan.rsvp_answer,
      updated_at: now,
    },
    { onConflict: 'event_id,user_id' }
  )

  if (error) {
    console.error('[event_rsvp_pending_answer] persist_failed')
    return { error: RSVP_ANSWER_SAVE_FAILED_MESSAGE }
  }

  return { ok: true }
}

export async function loadPendingRsvpAnswer(
  client: SupabaseClient<Database>,
  input: { eventId: string; userId: string }
): Promise<string | null> {
  const { data, error } = await client
    .from(PENDING_TABLE)
    .select('rsvp_answer')
    .eq('event_id', input.eventId)
    .eq('user_id', input.userId)
    .maybeSingle()

  if (error || typeof data?.rsvp_answer !== 'string' || !data.rsvp_answer) {
    return null
  }
  return data.rsvp_answer
}

export async function deletePendingRsvpAnswer(
  client: SupabaseClient<Database>,
  input: { eventId: string; userId: string }
): Promise<void> {
  await client
    .from(PENDING_TABLE)
    .delete()
    .eq('event_id', input.eventId)
    .eq('user_id', input.userId)
}
