import type { SupabaseClient } from '@supabase/supabase-js'
import type { CuratedBatchNotificationStatus } from '@/lib/compatibility/batch-generation-source'
import type { Database } from '@/lib/database.types'
import { loadProfileAccountEmails } from '@/lib/load-profile-account-emails'
import { MEMBER_PROFILES_VIEW } from '@/lib/member-profiles-view'
import { createMemberNotification } from '@/lib/member-notifications'
import { sendCuratedMatchesDeliveredEmail } from '@/lib/transactional-email'

export type CuratedMatchNotificationResult = CuratedBatchNotificationStatus

export async function notifyCuratedMatchesDelivered(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string
    matchCount: number
    batchId?: string | null
  }
): Promise<CuratedMatchNotificationResult> {
  if (input.matchCount <= 0) {
    await recordBatchNotification(supabase, input.batchId, 'skipped_empty')
    return 'skipped_empty'
  }

  void createMemberNotification(supabase, {
    userId: input.userId,
    type: 'curated_matches_delivered',
    metadata: { batchId: input.batchId ?? null, matchCount: input.matchCount },
  })

  const { data: profile, error } = await supabase
    .from(MEMBER_PROFILES_VIEW)
    .select('full_name')
    .eq('id', input.userId)
    .maybeSingle()

  const accountEmails = await loadProfileAccountEmails([input.userId])
  const email = accountEmails.get(input.userId)

  if (error || !email) {
    await recordBatchNotification(supabase, input.batchId, 'skipped_no_email')
    return 'skipped_no_email'
  }

  const result = await sendCuratedMatchesDeliveredEmail({
    to: email,
    memberName: profile?.full_name?.trim() || 'there',
    matchCount: input.matchCount,
  })

  if ('sent' in result && result.sent === true) {
    await recordBatchNotification(supabase, input.batchId, 'sent')
    return 'sent'
  }

  await recordBatchNotification(supabase, input.batchId, 'failed')
  return 'failed'
}

export async function recordBatchNotification(
  supabase: SupabaseClient<Database>,
  batchId: string | null | undefined,
  status: CuratedBatchNotificationStatus
): Promise<void> {
  if (!batchId) {
    return
  }

  const now = new Date().toISOString()
  const { error } = await supabase
    .from('curated_match_batches')
    .update({
      notification_status: status,
      notification_sent_at: status === 'sent' ? now : null,
    })
    .eq('id', batchId)

  if (error && error.code !== '42P01') {
    throw new Error(error.message)
  }
}
