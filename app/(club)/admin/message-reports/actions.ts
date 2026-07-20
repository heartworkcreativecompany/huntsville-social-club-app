'use server'

import { revalidatePath } from 'next/cache'
import { revalidateCuratedMatchMemberRoutes } from '@/lib/compatibility/revalidate-curated-match-routes'
import {
  adminInitiateMemberBlock,
  reviewMessageReportRecord,
  suspendMemberMessaging,
  unsuspendMemberMessaging,
} from '@/lib/message-report-moderation'
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
      error:
        'SUPABASE_SERVICE_ROLE_KEY is required for message report moderation.',
      admin: null,
    }
  }
  return { error: null, admin }
}

function revalidateReportPaths(conversationId: string, memberId?: string) {
  revalidatePath('/admin/message-reports')
  revalidatePath('/admin/moderation-actions')
  revalidateCuratedMatchMemberRoutes({
    messages: true,
    memberId: memberId ?? null,
    conversationId,
  })
}

export async function moderateMessageReport(input: {
  reportId: string
  action: 'reviewed' | 'dismissed'
  adminNotes?: string
}) {
  const auth = await requireAdmin()
  if (auth.error || !auth.userId) {
    return { error: auth.error ?? 'Unauthorized' }
  }

  if (input.action !== 'reviewed' && input.action !== 'dismissed') {
    return { error: 'Invalid moderation action.' }
  }

  const client = adminWriteClient()
  if (client.error || !client.admin) {
    return { error: client.error ?? 'Admin client unavailable.' }
  }

  const { data: report } = await client.admin
    .from('member_conversation_reports')
    .select('conversation_id')
    .eq('id', input.reportId)
    .maybeSingle()

  const result = await reviewMessageReportRecord(client.admin, {
    actorId: auth.userId,
    reportId: input.reportId,
    action: input.action,
    adminNotes: input.adminNotes,
  })

  if (!result.ok) {
    return { error: result.error }
  }

  if (report?.conversation_id) {
    revalidateReportPaths(report.conversation_id)
  }

  return { success: true as const }
}

export async function suspendReportedMemberMessaging(input: {
  reportId: string
  adminNotes?: string
  markReportReviewed?: boolean
}) {
  const auth = await requireAdmin()
  if (auth.error || !auth.userId) {
    return { error: auth.error ?? 'Unauthorized' }
  }

  const client = adminWriteClient()
  if (client.error || !client.admin) {
    return { error: client.error ?? 'Admin client unavailable.' }
  }

  const { data: report, error: loadError } = await client.admin
    .from('member_conversation_reports')
    .select(
      'id, conversation_id, reported_member_id, reporter_id'
    )
    .eq('id', input.reportId)
    .maybeSingle()

  if (loadError) {
    return { error: loadError.message }
  }

  if (!report?.reported_member_id) {
    return { error: 'This report does not include a reported member.' }
  }

  const result = await suspendMemberMessaging(client.admin, {
    actorId: auth.userId,
    targetMemberId: report.reported_member_id,
    adminNotes: input.adminNotes,
    reportId: report.id,
    markReportReviewed: input.markReportReviewed ?? true,
  })

  if (!result.ok) {
    return { error: result.error }
  }

  revalidateReportPaths(report.conversation_id, report.reported_member_id)

  return { success: true as const }
}

export async function adminBlockReportedMember(input: {
  reportId: string
  adminNotes?: string
}) {
  const auth = await requireAdmin()
  if (auth.error || !auth.userId) {
    return { error: auth.error ?? 'Unauthorized' }
  }

  const client = adminWriteClient()
  if (client.error || !client.admin) {
    return { error: client.error ?? 'Admin client unavailable.' }
  }

  const { data: report, error: loadError } = await client.admin
    .from('member_conversation_reports')
    .select(
      'id, conversation_id, reported_member_id, reporter_id'
    )
    .eq('id', input.reportId)
    .maybeSingle()

  if (loadError) {
    return { error: loadError.message }
  }

  if (!report?.reported_member_id) {
    return { error: 'This report does not include a reported member.' }
  }

  const result = await adminInitiateMemberBlock(client.admin, {
    actorId: auth.userId,
    blockerId: report.reporter_id,
    blockedMemberId: report.reported_member_id,
    adminNotes: input.adminNotes,
    reportId: report.id,
  })

  if (!result.ok) {
    return { error: result.error }
  }

  revalidateReportPaths(report.conversation_id)

  return {
    success: true as const,
    alreadyBlocked: result.alreadyBlocked,
  }
}

export async function unsuspendReportedMemberMessaging(input: {
  reportId: string
  adminNotes?: string
}) {
  const auth = await requireAdmin()
  if (auth.error || !auth.userId) {
    return { error: auth.error ?? 'Unauthorized' }
  }

  const client = adminWriteClient()
  if (client.error || !client.admin) {
    return { error: client.error ?? 'Admin client unavailable.' }
  }

  const { data: report, error: loadError } = await client.admin
    .from('member_conversation_reports')
    .select('id, conversation_id, reported_member_id')
    .eq('id', input.reportId)
    .maybeSingle()

  if (loadError) {
    return { error: loadError.message }
  }

  if (!report?.reported_member_id) {
    return { error: 'This report does not include a reported member.' }
  }

  const result = await unsuspendMemberMessaging(client.admin, {
    actorId: auth.userId,
    targetMemberId: report.reported_member_id,
    adminNotes: input.adminNotes,
    reportId: report.id,
  })

  if (!result.ok) {
    return { error: result.error }
  }

  revalidateReportPaths(report.conversation_id, report.reported_member_id)

  return { success: true as const }
}
