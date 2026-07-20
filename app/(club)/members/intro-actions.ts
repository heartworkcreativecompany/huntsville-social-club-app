'use server'

import { revalidatePath } from 'next/cache'
import { sendMessageRequest } from '@/app/(club)/messages/actions'
import { assertMessagingAllowed } from '@/lib/require-messaging'

export async function requestCuratedIntro(note?: string) {
  return {
    error:
      'Concierge intro requests are paused. Message members directly from the directory when you have messaging access.',
  }
}

export async function requestMemberIntro(
  targetMemberId: string,
  body: string
) {
  const gate = await assertMessagingAllowed()
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
