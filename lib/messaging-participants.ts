import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { loadAcceptedIdentityStatus } from '@/lib/identity-verification-access'
import {
  IDENTITY_LOOKUP_UNAVAILABLE_MESSAGE,
  IDENTITY_MUTUAL_MESSAGE,
  IDENTITY_REQUIRED_BEFORE_MESSAGING,
} from '@/lib/identity-verification'
import { MEMBER_PROFILES_VIEW } from '@/lib/member-profiles-view'
import { isMessagingSuspended } from '@/lib/messaging-suspension'

/**
 * Shared authorization for service-role message writes.
 * RLS does not apply to service_role, so request creation, replies, and
 * recontact retries must call this before inserting.
 * Recipient identity is required only when opening a new request.
 */
export async function assertMembersMayExchange(
  supabase: SupabaseClient<Database>,
  senderId: string,
  otherMemberId: string,
  options: { requireOtherIdentity: boolean }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: profiles, error } = await supabase
    .from(MEMBER_PROFILES_VIEW)
    .select('id, messaging_suspended_at, application_status')
    .in('id', [senderId, otherMemberId])

  if (error) {
    return { ok: false, error: error.message }
  }

  if ((profiles ?? []).length !== 2) {
    return { ok: false, error: 'Member profile not found.' }
  }

  for (const profile of profiles ?? []) {
    if (profile.application_status !== 'approved') {
      return { ok: false, error: 'Both members must be approved to message.' }
    }

    if (isMessagingSuspended(profile)) {
      return {
        ok: false,
        error: 'Messaging is suspended for one of the members in this request.',
      }
    }
  }

  const { data: blocks, error: blockError } = await supabase
    .from('member_member_blocks')
    .select('blocker_id, blocked_member_id')
    .or(`blocker_id.eq.${senderId},blocked_member_id.eq.${senderId}`)

  if (blockError) {
    return {
      ok: false,
      error:
        blockError.code === '42P01'
          ? 'Messaging is unavailable.'
          : blockError.message,
    }
  }

  const pairBlocked = (blocks ?? []).filter(
    (block) =>
      (block.blocker_id === senderId && block.blocked_member_id === otherMemberId) ||
      (block.blocker_id === otherMemberId && block.blocked_member_id === senderId)
  )
  if (pairBlocked.length > 0) {
    const blockedBySender = pairBlocked.some(
      (block) =>
        block.blocker_id === senderId && block.blocked_member_id === otherMemberId
    )
    return {
      ok: false,
      error: blockedBySender
        ? 'You cannot message this member.'
        : 'This member is unavailable for messaging.',
    }
  }

  const senderIdentity = await loadAcceptedIdentityStatus(supabase, senderId)
  if (senderIdentity === 'unavailable') {
    return { ok: false, error: IDENTITY_LOOKUP_UNAVAILABLE_MESSAGE }
  }
  if (senderIdentity !== 'verified') {
    return { ok: false, error: IDENTITY_REQUIRED_BEFORE_MESSAGING }
  }

  if (!options.requireOtherIdentity) {
    return { ok: true }
  }

  const otherIdentity = await loadAcceptedIdentityStatus(supabase, otherMemberId)
  if (otherIdentity === 'unavailable') {
    return { ok: false, error: IDENTITY_LOOKUP_UNAVAILABLE_MESSAGE }
  }
  if (otherIdentity !== 'verified') {
    return { ok: false, error: IDENTITY_MUTUAL_MESSAGE }
  }

  return { ok: true }
}
