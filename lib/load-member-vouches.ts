import { createClient } from '@/lib/supabase/server'
import { memberDisplayName } from '@/lib/members-discovery'
import { MEMBER_PROFILES_VIEW } from '@/lib/member-profiles-view'
import {
  summarizeVouches,
  type MemberVouch,
  type PublicVouchEndorsement,
  type VouchSummary,
  type VouchType,
} from '@/lib/member-vouches'

export async function loadVouchSummaryForMember(
  memberId: string
): Promise<VouchSummary> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('member_vouches')
    .select('vouch_type, status')
    .eq('vouchee_id', memberId)
    .eq('status', 'approved')

  if (error || !data) {
    return summarizeVouches([])
  }

  return summarizeVouches(data as Pick<MemberVouch, 'vouch_type' | 'status'>[])
}

export async function loadViewerVouchesForMember(
  viewerId: string,
  memberId: string
): Promise<Pick<MemberVouch, 'id' | 'vouch_type' | 'status'>[]> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('member_vouches')
    .select('id, vouch_type, status, note')
    .eq('vouchee_id', memberId)
    .eq('voucher_id', viewerId)
    .neq('status', 'removed')

  return (data ?? []) as Pick<
    MemberVouch,
    'id' | 'vouch_type' | 'status' | 'note'
  >[]
}

export async function loadApprovedVouchEndorsements(
  memberId: string
): Promise<PublicVouchEndorsement[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('member_vouches')
    .select('id, vouch_type, note, moderated_at, voucher_id')
    .eq('vouchee_id', memberId)
    .eq('status', 'approved')
    .order('moderated_at', { ascending: false })

  if (error || !data || data.length === 0) return []

  const authorIds = [...new Set(data.map((row) => row.voucher_id))]
  const { data: authors } = await supabase
    .from(MEMBER_PROFILES_VIEW)
    .select('id, full_name')
    .in('id', authorIds)

  const names = new Map(
    (authors ?? []).map((author) => [author.id, memberDisplayName(author)])
  )

  return data.map((row) => ({
    id: row.id,
    vouchType: row.vouch_type as VouchType,
    authorName: names.get(row.voucher_id) ?? 'Member',
    approvedAt: row.moderated_at,
    endorsement: row.note?.trim() ? row.note.trim() : null,
  }))
}

export async function loadAdminVouchesForMember(
  memberId: string
): Promise<MemberVouch[]> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('member_vouches')
    .select('*')
    .eq('vouchee_id', memberId)
    .order('created_at', { ascending: false })

  return (data ?? []) as MemberVouch[]
}
