import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
  IN_PERSON_IDENTITY_METHOD,
  type InPersonIdentitySource,
} from '@/lib/identity-verification'
import { logModerationAction } from '@/lib/moderation-actions'

export const IN_PERSON_IDENTITY_NOT_AUTHORIZED =
  'Administrator access required.' as const

const NOTE_MAX_LENGTH = 280

type AdminClient = SupabaseClient<Database>

export type ActiveInPersonIdentity = {
  id: string
  source: InPersonIdentitySource
  approvedAt: string | null
  reconciledAt: string | null
  hasApprover: boolean
  note: string | null
}

function normalizeNote(note: string | null | undefined): string | null {
  const trimmed = note?.trim() ?? ''
  if (!trimmed) return null
  return trimmed.length > NOTE_MAX_LENGTH
    ? trimmed.slice(0, NOTE_MAX_LENGTH)
    : trimmed
}

function isMissingRelation(error: { code?: string; message?: string } | null) {
  if (!error) return false
  if (error.code === '42P01' || error.code === '42703') return true
  const message = error.message?.toLowerCase() ?? ''
  return message.includes('does not exist') || message.includes('schema cache')
}

export async function loadActiveInPersonIdentity(
  admin: AdminClient | null | undefined,
  profileId: string
): Promise<ActiveInPersonIdentity | null> {
  if (!admin || !profileId) return null

  const { data, error } = await admin
    .from('in_person_identity_verifications')
    .select('id, source, approved_by, approved_at, reconciled_at, note, status, revoked_at')
    .eq('profile_id', profileId)
    .eq('status', 'verified')
    .is('revoked_at', null)
    .maybeSingle()

  if (error || !data) {
    if (error && !isMissingRelation(error)) {
      console.error('[identity] in-person status could not be loaded')
    }
    return null
  }

  if (
    data.source !== 'admin_action' &&
    data.source !== 'legacy_approval_gates.identity_verified'
  ) {
    return null
  }

  return {
    id: data.id,
    source: data.source,
    approvedAt: data.approved_at,
    reconciledAt: data.reconciled_at,
    hasApprover: Boolean(data.approved_by),
    note: data.note,
  }
}

export async function approveInPersonIdentity(
  admin: AdminClient,
  input: {
    isAdmin: boolean
    actorId: string
    profileId: string
    note?: string | null
  }
): Promise<
  | { ok: true; alreadyVerified: boolean }
  | { ok: false; error: string }
> {
  if (!input.isAdmin) {
    return { ok: false, error: IN_PERSON_IDENTITY_NOT_AUTHORIZED }
  }
  if (!input.actorId || !input.profileId) {
    return { ok: false, error: IN_PERSON_IDENTITY_NOT_AUTHORIZED }
  }

  const existing = await loadActiveInPersonIdentity(admin, input.profileId)
  if (existing) {
    return { ok: true, alreadyVerified: true }
  }

  const approvedAt = new Date().toISOString()
  const { data, error } = await admin
    .from('in_person_identity_verifications')
    .insert({
      profile_id: input.profileId,
      method: IN_PERSON_IDENTITY_METHOD,
      status: 'verified',
      source: 'admin_action',
      approved_by: input.actorId,
      approved_at: approvedAt,
      reconciled_at: null,
      note: normalizeNote(input.note),
    })
    .select('id')
    .single()

  if (error || !data) {
    if (error?.code === '23505') {
      return { ok: true, alreadyVerified: true }
    }
    return { ok: false, error: 'Could not record in-person identity verification.' }
  }

  const audit = await logModerationAction(admin, {
    actorId: input.actorId,
    targetMemberId: input.profileId,
    actionType: 'in_person_identity_verified',
    sourceType: 'in_person_identity_verification',
    sourceId: data.id,
    details: JSON.stringify({
      method: IN_PERSON_IDENTITY_METHOD,
      source: 'admin_action',
    }),
  })
  if (!audit.ok) {
    return { ok: false, error: 'In-person verification was saved, but the audit record failed.' }
  }

  return { ok: true, alreadyVerified: false }
}

export async function revokeInPersonIdentity(
  admin: AdminClient,
  input: { isAdmin: boolean; actorId: string; profileId: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.isAdmin) {
    return { ok: false, error: IN_PERSON_IDENTITY_NOT_AUTHORIZED }
  }
  if (!input.actorId || !input.profileId) {
    return { ok: false, error: IN_PERSON_IDENTITY_NOT_AUTHORIZED }
  }

  const existing = await loadActiveInPersonIdentity(admin, input.profileId)
  if (!existing) {
    return { ok: false, error: 'No in-person identity verification is active.' }
  }

  const revokedAt = new Date().toISOString()
  const { data, error } = await admin
    .from('in_person_identity_verifications')
    .update({
      status: 'revoked',
      revoked_at: revokedAt,
      revoked_by: input.actorId,
    })
    .eq('id', existing.id)
    .is('revoked_at', null)
    .select('id')
    .maybeSingle()

  if (error || !data) {
    return { ok: false, error: 'Could not revoke in-person identity verification.' }
  }

  const audit = await logModerationAction(admin, {
    actorId: input.actorId,
    targetMemberId: input.profileId,
    actionType: 'in_person_identity_revoked',
    sourceType: 'in_person_identity_verification',
    sourceId: existing.id,
    details: JSON.stringify({ method: IN_PERSON_IDENTITY_METHOD }),
  })
  if (!audit.ok) {
    return { ok: false, error: 'In-person verification was revoked, but the audit record failed.' }
  }

  return { ok: true }
}
