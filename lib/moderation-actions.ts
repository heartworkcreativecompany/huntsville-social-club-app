import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { captureOperationalError } from '@/lib/capture-error'

export type ModerationActionType =
  | 'message_report_reviewed'
  | 'message_report_dismissed'
  | 'messaging_suspended'
  | 'messaging_unsuspended'
  | 'admin_member_block'
  | 'member_deleted'
  | 'recognition_badge_awarded'
  | 'recognition_badge_revoked'
  | 'membership_access_override_granted'
  | 'membership_access_override_updated'
  | 'membership_access_override_revoked'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** `moderation_actions.source_id` is uuid. Never send slugs or other text. */
export function uuidOrNull(value: string | null | undefined): string | null {
  if (!value) return null
  return UUID_RE.test(value) ? value : null
}

export async function logModerationAction(
  supabase: SupabaseClient<Database>,
  input: {
    actorId: string | null
    targetMemberId?: string | null
    actionType: ModerationActionType
    sourceType?: string | null
    sourceId?: string | null
    reason?: string | null
    details?: string | null
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from('moderation_actions').insert({
    actor_id: input.actorId,
    target_member_id: input.targetMemberId ?? null,
    action_type: input.actionType,
    source_type: input.sourceType ?? null,
    source_id: uuidOrNull(input.sourceId),
    reason: input.reason?.trim() || null,
    details: input.details?.trim() || null,
  })

  if (error) {
    if (error.code === '42P01') {
      return { ok: true }
    }
    captureOperationalError('moderation-audit', error, {
      actionType: input.actionType,
    })
    return { ok: false, error: error.message }
  }

  return { ok: true }
}
