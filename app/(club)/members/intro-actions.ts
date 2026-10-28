'use server'

import { revalidatePath } from 'next/cache'
import { sendMessageRequest } from '@/app/(club)/messages/actions'
import { assertCanStartMessageRequest } from '@/lib/require-messaging'

export async function requestCuratedIntro(note?: string) {
  void note
  return {
    error:
      'Concierge intro requests are turned off. Send a message request from a recommendation or member profile.',
  }
}

export async function requestMemberIntro(
  targetMemberId: string,
  body: string
) {
  const gate = await assertCanStartMessageRequest({ targetMemberId })
  if (!gate.ok) {
    return { error: gate.error }
  }

  const result = await sendMessageRequest({
    targetMemberId,
    body,
  })

  if ('error' in result && result.error) {
    return { error: result.error }
  }

  revalidatePath('/members')
  revalidatePath(`/members/${targetMemberId}`)
  revalidatePath('/messages')
  revalidatePath(`/messages/${result.conversationId}`)

  return { success: true as const, conversationId: result.conversationId }
}
