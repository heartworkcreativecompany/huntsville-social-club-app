'use server'

import { revalidatePath } from 'next/cache'
import {
  notifyRecontactDeniedFinal,
  notifyRecontactRecipientPrompt,
} from '@/lib/message-request-notifications'
import {
  adminDismissRecontactRequest,
  adminPromptRecipientReconsideration,
} from '@/lib/message-recontact-flow'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in.', userId: null as string | null }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return { error: 'Administrator access required.', userId: null }
  }

  return { error: null, userId: user.id }
}

function adminWriteClient() {
  const admin = createAdminClient()
  if (!admin) {
    return {
      error: 'SUPABASE_SERVICE_ROLE_KEY is required for recontact administration.',
      admin: null,
    }
  }
  return { error: null, admin }
}

function revalidateRecontact(conversationId: string) {
  revalidatePath('/admin/recontact-requests')
  revalidatePath('/messages')
  revalidatePath(`/messages/${conversationId}`)
}

export async function adminAskRecipientToReconsider(conversationId: string) {
  const auth = await requireAdmin()
  if (auth.error || !auth.userId) {
    return { error: auth.error ?? 'Unauthorized' }
  }

  const client = adminWriteClient()
  if (client.error || !client.admin) {
    return { error: client.error ?? 'Admin client unavailable.' }
  }

  const result = await adminPromptRecipientReconsideration(client.admin, {
    adminId: auth.userId,
    conversationId,
  })

  if (!result.ok) {
    return { error: result.error }
  }

  await notifyRecontactRecipientPrompt(client.admin, result.result)
  revalidateRecontact(conversationId)

  return { success: true as const }
}

export async function adminDismissRecontactReview(conversationId: string) {
  const auth = await requireAdmin()
  if (auth.error || !auth.userId) {
    return { error: auth.error ?? 'Unauthorized' }
  }

  const client = adminWriteClient()
  if (client.error || !client.admin) {
    return { error: client.error ?? 'Admin client unavailable.' }
  }

  const result = await adminDismissRecontactRequest(client.admin, {
    adminId: auth.userId,
    conversationId,
  })

  if (!result.ok) {
    return { error: result.error }
  }

  await notifyRecontactDeniedFinal(client.admin, result.result)
  revalidateRecontact(conversationId)

  return { success: true as const }
}
