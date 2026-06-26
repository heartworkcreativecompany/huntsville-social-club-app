'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertMessagingAllowed } from '@/lib/require-messaging'

export async function sendMemberMessage(input: {
  conversationId: string
  body: string
}) {
  const gate = await assertMessagingAllowed()
  if (!gate.ok) {
    return { error: gate.error }
  }

  const body = input.body.trim()
  if (!body) {
    return { error: 'Message cannot be empty.' }
  }

  const supabase = await createClient()

  const { data: conversation } = await supabase
    .from('member_conversations')
    .select('id, participant_a, participant_b')
    .eq('id', input.conversationId)
    .maybeSingle()

  if (
    !conversation ||
    (conversation.participant_a !== gate.userId &&
      conversation.participant_b !== gate.userId)
  ) {
    return { error: 'Conversation not found.' }
  }

  const { error } = await supabase.from('member_messages').insert({
    conversation_id: input.conversationId,
    sender_id: gate.userId,
    body,
  })

  if (error) {
    return { error: error.message }
  }

  await supabase
    .from('member_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', input.conversationId)

  revalidatePath('/messages')
  revalidatePath('/members')

  return { success: true as const }
}
