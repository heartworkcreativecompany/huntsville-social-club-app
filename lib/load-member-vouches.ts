import { createClient } from '@/lib/supabase/server'
import {
  summarizeVouches,
  type MemberVouch,
  type VouchSummary,
} from '@/lib/member-vouches'

export async function loadVouchSummaryForMember(
  memberId: string
): Promise<VouchSummary> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('member_vouches')
    .select('vouch_type, status')
    .eq('vouchee_id', memberId)
    .eq('status', 'active')

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
    .select('id, vouch_type, status')
    .eq('vouchee_id', memberId)
    .eq('voucher_id', viewerId)
    .neq('status', 'removed')

  return (data ?? []) as Pick<MemberVouch, 'id' | 'vouch_type' | 'status'>[]
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
