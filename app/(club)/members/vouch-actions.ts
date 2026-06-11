'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  VOUCH_NOTE_MAX,
  VOUCH_RELATIONSHIP_OPTIONS,
  VOUCH_TYPE_OPTIONS,
  type VouchType,
} from '@/lib/member-vouches'

async function requireApprovedMember() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in.', supabase: null, userId: null }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('application_status')
    .eq('id', user.id)
    .single()

  if (profile?.application_status !== 'approved') {
    return {
      error: 'Only approved members can vouch for others.',
      supabase: null,
      userId: null,
    }
  }

  return { error: null, supabase, userId: user.id }
}

export async function createMemberVouch(input: {
  voucheeId: string
  vouchType: VouchType
  relationshipContext: string
  note?: string
}) {
  const { error, supabase, userId } = await requireApprovedMember()
  if (error || !supabase || !userId) return { error: error ?? 'Unauthorized.' }

  if (input.voucheeId === userId) {
    return { error: 'You cannot vouch for yourself.' }
  }

  const validType = VOUCH_TYPE_OPTIONS.some((o) => o.value === input.vouchType)
  if (!validType) {
    return { error: 'Please select a vouch type.' }
  }

  const context = input.relationshipContext.trim()
  if (!context) {
    return { error: 'Please describe how you know this member.' }
  }
  if (
    !VOUCH_RELATIONSHIP_OPTIONS.includes(
      context as (typeof VOUCH_RELATIONSHIP_OPTIONS)[number]
    ) &&
    context.length < 8
  ) {
    return { error: 'Please provide a bit more context about your connection.' }
  }

  const note = input.note?.trim() ?? ''
  if (note.length > VOUCH_NOTE_MAX) {
    return { error: `Notes must be ${VOUCH_NOTE_MAX} characters or fewer.` }
  }

  const { data: vouchee } = await supabase
    .from('profiles')
    .select('application_status')
    .eq('id', input.voucheeId)
    .single()

  if (vouchee?.application_status !== 'approved') {
    return { error: 'You can only vouch for approved members.' }
  }

  const { error: insertError } = await supabase.from('member_vouches').insert({
    voucher_id: userId,
    vouchee_id: input.voucheeId,
    vouch_type: input.vouchType,
    relationship_context: context,
    note: note || null,
    status: 'active',
  })

  if (insertError) {
    if (insertError.code === '23505') {
      return {
        error: 'You have already left this type of vouch for this member.',
      }
    }
    return { error: insertError.message }
  }

  revalidatePath(`/members/${input.voucheeId}`)
  return { success: true as const }
}

export async function withdrawMemberVouch(vouchId: string) {
  const { error, supabase, userId } = await requireApprovedMember()
  if (error || !supabase || !userId) return { error: error ?? 'Unauthorized.' }

  const { data: vouch } = await supabase
    .from('member_vouches')
    .select('vouchee_id, voucher_id')
    .eq('id', vouchId)
    .single()

  if (!vouch || vouch.voucher_id !== userId) {
    return { error: 'Vouch not found.' }
  }

  const { error: updateError } = await supabase
    .from('member_vouches')
    .update({
      status: 'removed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', vouchId)

  if (updateError) {
    return { error: updateError.message }
  }

  revalidatePath(`/members/${vouch.vouchee_id}`)
  return { success: true as const }
}

export async function moderateMemberVouch(input: {
  vouchId: string
  status: 'active' | 'removed' | 'flagged'
  reason?: string
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in.' }
  }

  const { data: admin } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (admin?.role !== 'admin') {
    return { error: 'Admin access required.' }
  }

  const { data: vouch } = await supabase
    .from('member_vouches')
    .select('vouchee_id')
    .eq('id', input.vouchId)
    .single()

  if (!vouch) {
    return { error: 'Vouch not found.' }
  }

  const { error: updateError } = await supabase
    .from('member_vouches')
    .update({
      status: input.status,
      moderated_at: new Date().toISOString(),
      moderated_by: user.id,
      moderation_reason: input.reason?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.vouchId)

  if (updateError) {
    return { error: updateError.message }
  }

  revalidatePath(`/members/${vouch.vouchee_id}`)
  revalidatePath('/admin/applications')
  return { success: true as const }
}
