import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

const CURATED_INTRO_WELCOME_BODY =
  'Your curated intro was approved. You can message each other here — say hello when you are ready.'

export async function insertCuratedIntroWelcomeMessage(
  supabase: SupabaseClient<Database>,
  input: {
    conversationId: string
    requesterId: string
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: existing } = await supabase
    .from('member_messages')
    .select('id')
    .eq('conversation_id', input.conversationId)
    .eq('is_system', true)
    .limit(1)

  if (existing && existing.length > 0) {
    return { ok: true }
  }

  const { error } = await supabase.from('member_messages').insert({
    conversation_id: input.conversationId,
    sender_id: input.requesterId,
    body: CURATED_INTRO_WELCOME_BODY,
    is_system: true,
  })

  if (error) {
    return { ok: false, error: error.message }
  }

  await supabase
    .from('member_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', input.conversationId)

  return { ok: true }
}
