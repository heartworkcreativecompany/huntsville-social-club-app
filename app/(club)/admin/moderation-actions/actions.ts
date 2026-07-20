'use server'

import { revalidatePath } from 'next/cache'
import { revalidateCuratedMatchMemberRoutes } from '@/lib/compatibility/revalidate-curated-match-routes'
import { unsuspendMemberMessaging } from '@/lib/message-report-moderation'
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
      error: 'SUPABASE_SERVICE_ROLE_KEY is required for moderation actions.',
      admin: null,
    }
  }
  return { error: null, admin }
}

function revalidateModerationPaths(input: {
  targetMemberId: string
  conversationId?: string | null
}) {
  revalidatePath('/admin/moderation-actions')
  revalidatePath('/admin/message-reports')
  revalidateCuratedMatchMemberRoutes({
    messages: true,
    memberId: input.targetMemberId,
    conversationId: input.conversationId ?? null,
  })
}

export async function unsuspendMemberMessagingAction(input: {
  targetMemberId: string
  adminNotes?: string
  reportId?: string
  conversationId?: string
}) {
  const auth = await requireAdmin()
  if (auth.error || !auth.userId) {
    return { error: auth.error ?? 'Unauthorized' }
  }

  const client = adminWriteClient()
  if (client.error || !client.admin) {
    return { error: client.error ?? 'Admin client unavailable.' }
  }

  const result = await unsuspendMemberMessaging(client.admin, {
    actorId: auth.userId,
    targetMemberId: input.targetMemberId,
    adminNotes: input.adminNotes,
    reportId: input.reportId,
  })

  if (!result.ok) {
    return { error: result.error }
  }

  revalidateModerationPaths({
    targetMemberId: input.targetMemberId,
    conversationId: input.conversationId,
  })

  return { success: true as const }
}
