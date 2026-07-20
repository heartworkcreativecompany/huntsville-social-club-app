import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { logModerationAction } from '@/lib/moderation-actions'
import { createMemberNotification } from '@/lib/member-notifications'

type ReportContext = {
  id: string
  status: string
  conversation_id: string
  reporter_id: string
  reported_member_id: string | null
}

async function loadReportContext(
  supabase: SupabaseClient<Database>,
  reportId: string
): Promise<
  | { ok: true; report: ReportContext }
  | { ok: false; error: string }
> {
  const { data: report, error } = await supabase
    .from('member_conversation_reports')
    .select(
      'id, status, conversation_id, reporter_id, reported_member_id'
    )
    .eq('id', reportId)
    .maybeSingle()

  if (error) {
    return { ok: false, error: error.message }
  }

  if (!report) {
    return { ok: false, error: 'Report not found.' }
  }

  return { ok: true, report }
}

export async function suspendMemberMessaging(
  supabase: SupabaseClient<Database>,
  input: {
    actorId: string
    targetMemberId: string
    adminNotes?: string
    reportId?: string
    markReportReviewed?: boolean
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, messaging_suspended_at')
    .eq('id', input.targetMemberId)
    .maybeSingle()

  if (profileError) {
    return { ok: false, error: profileError.message }
  }

  if (!profile) {
    return { ok: false, error: 'Member not found.' }
  }

  if (profile.messaging_suspended_at) {
    return { ok: false, error: 'Messaging is already suspended for this member.' }
  }

  const suspendedAt = new Date().toISOString()
  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      messaging_suspended_at: suspendedAt,
      messaging_suspension_reason: input.adminNotes?.trim() || null,
      messaging_suspended_by: input.actorId,
      updated_at: suspendedAt,
    })
    .eq('id', input.targetMemberId)

  if (updateError) {
    return { ok: false, error: updateError.message }
  }

  const log = await logModerationAction(supabase, {
    actorId: input.actorId,
    targetMemberId: input.targetMemberId,
    actionType: 'messaging_suspended',
    sourceType: input.reportId ? 'member_conversation_report' : null,
    sourceId: input.reportId ?? null,
    reason: input.adminNotes?.trim() || null,
    details: 'Messaging access suspended by staff.',
  })

  if (!log.ok) {
    return log
  }

  if (input.markReportReviewed && input.reportId) {
    const { error: reportError } = await supabase
      .from('member_conversation_reports')
      .update({
        status: 'reviewed',
        admin_notes: input.adminNotes?.trim() || null,
        admin_reviewed_at: suspendedAt,
        reviewed_by: input.actorId,
      })
      .eq('id', input.reportId)
      .eq('status', 'pending')

    if (reportError) {
      return { ok: false, error: reportError.message }
    }

    const reviewLog = await logModerationAction(supabase, {
      actorId: input.actorId,
      targetMemberId: input.targetMemberId,
      actionType: 'message_report_reviewed',
      sourceType: 'member_conversation_report',
      sourceId: input.reportId,
      reason: input.adminNotes?.trim() || null,
      details: 'Report marked reviewed as part of messaging suspension.',
    })

    if (!reviewLog.ok) {
      return reviewLog
    }
  }

  void createMemberNotification(supabase, {
    userId: input.targetMemberId,
    type: 'messaging_suspended',
    metadata: { reportId: input.reportId ?? null },
  })

  return { ok: true }
}

export async function unsuspendMemberMessaging(
  supabase: SupabaseClient<Database>,
  input: {
    actorId: string
    targetMemberId: string
    adminNotes?: string
    reportId?: string
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, messaging_suspended_at')
    .eq('id', input.targetMemberId)
    .maybeSingle()

  if (profileError) {
    return { ok: false, error: profileError.message }
  }

  if (!profile) {
    return { ok: false, error: 'Member not found.' }
  }

  if (!profile.messaging_suspended_at) {
    return { ok: false, error: 'Messaging is not suspended for this member.' }
  }

  const restoredAt = new Date().toISOString()
  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      messaging_suspended_at: null,
      messaging_suspension_reason: null,
      messaging_suspended_by: null,
      updated_at: restoredAt,
    })
    .eq('id', input.targetMemberId)

  if (updateError) {
    return { ok: false, error: updateError.message }
  }

  const log = await logModerationAction(supabase, {
    actorId: input.actorId,
    targetMemberId: input.targetMemberId,
    actionType: 'messaging_unsuspended',
    sourceType: input.reportId ? 'member_conversation_report' : null,
    sourceId: input.reportId ?? null,
    reason: input.adminNotes?.trim() || null,
    details: 'Messaging access restored by staff.',
  })

  if (!log.ok) {
    return log
  }

  void createMemberNotification(supabase, {
    userId: input.targetMemberId,
    type: 'messaging_restored',
    metadata: { reportId: input.reportId ?? null },
  })

  return { ok: true }
}

export async function adminInitiateMemberBlock(
  supabase: SupabaseClient<Database>,
  input: {
    actorId: string
    blockerId: string
    blockedMemberId: string
    adminNotes?: string
    reportId?: string
  }
): Promise<
  | { ok: true; alreadyBlocked: boolean }
  | { ok: false; error: string }
> {
  const { data: existing } = await supabase
    .from('member_member_blocks')
    .select('id')
    .eq('blocker_id', input.blockerId)
    .eq('blocked_member_id', input.blockedMemberId)
    .maybeSingle()

  if (existing) {
    return { ok: true, alreadyBlocked: true }
  }

  const { error } = await supabase.from('member_member_blocks').insert({
    blocker_id: input.blockerId,
    blocked_member_id: input.blockedMemberId,
  })

  if (error) {
    return { ok: false, error: error.message }
  }

  const log = await logModerationAction(supabase, {
    actorId: input.actorId,
    targetMemberId: input.blockedMemberId,
    actionType: 'admin_member_block',
    sourceType: input.reportId ? 'member_conversation_report' : null,
    sourceId: input.reportId ?? null,
    reason: input.adminNotes?.trim() || null,
    details: `Admin-initiated block on behalf of reporter ${input.blockerId}.`,
  })

  if (!log.ok) {
    return log
  }

  return { ok: true, alreadyBlocked: false }
}

export async function reviewMessageReportRecord(
  supabase: SupabaseClient<Database>,
  input: {
    actorId: string
    reportId: string
    action: 'reviewed' | 'dismissed'
    adminNotes?: string
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const loaded = await loadReportContext(supabase, input.reportId)
  if (!loaded.ok) {
    return loaded
  }

  if (loaded.report.status !== 'pending') {
    return { ok: false, error: 'This report has already been reviewed.' }
  }

  const reviewedAt = new Date().toISOString()
  const { error: updateError } = await supabase
    .from('member_conversation_reports')
    .update({
      status: input.action,
      admin_notes: input.adminNotes?.trim() || null,
      admin_reviewed_at: reviewedAt,
      reviewed_by: input.actorId,
    })
    .eq('id', input.reportId)
    .eq('status', 'pending')

  if (updateError) {
    return { ok: false, error: updateError.message }
  }

  const log = await logModerationAction(supabase, {
    actorId: input.actorId,
    targetMemberId: loaded.report.reported_member_id,
    actionType:
      input.action === 'reviewed'
        ? 'message_report_reviewed'
        : 'message_report_dismissed',
    sourceType: 'member_conversation_report',
    sourceId: input.reportId,
    reason: input.adminNotes?.trim() || null,
    details: `Report ${input.action}.`,
  })

  if (!log.ok) {
    return log
  }

  return { ok: true }
}
