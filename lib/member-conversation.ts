import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { orderedPair } from '@/lib/member-messages'

export async function ensureMemberConversation(
  supabase: SupabaseClient<Database>,
  userIdA: string,
  userIdB: string
): Promise<
  | { ok: true; conversationId: string; created: boolean }
  | { ok: false; error: string }
> {
  if (userIdA === userIdB) {
    return { ok: false, error: 'Cannot create a conversation with yourself.' }
  }

  const [participant_a, participant_b] = orderedPair(userIdA, userIdB)

  const { data: existing, error: existingError } = await supabase
    .from('member_conversations')
    .select('id')
    .eq('participant_a', participant_a)
    .eq('participant_b', participant_b)
    .maybeSingle()

  if (existingError) {
    return { ok: false, error: existingError.message }
  }

  if (existing) {
    return { ok: true, conversationId: existing.id, created: false }
  }

  const { data: created, error: insertError } = await supabase
    .from('member_conversations')
    .insert({ participant_a, participant_b })
    .select('id')
    .single()

  if (insertError || !created) {
    return {
      ok: false,
      error: insertError?.message ?? 'Failed to create conversation.',
    }
  }

  return { ok: true, conversationId: created.id, created: true }
}
