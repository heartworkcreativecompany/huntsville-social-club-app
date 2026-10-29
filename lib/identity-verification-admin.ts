import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
  acceptedIdentityStatus,
  IN_PERSON_IDENTITY_METHOD,
  type AcceptedIdentityStatus,
  type InPersonIdentitySource,
} from '@/lib/identity-verification'
import { logModerationAction } from '@/lib/moderation-actions'

export const IN_PERSON_IDENTITY_NOT_AUTHORIZED =
  'Administrator access required.' as const

export const IN_PERSON_RECORD_CONFIRMATION =
  'I confirm that I checked this member\u2019s identity in person.' as const

export const IN_PERSON_RECORD_BUTTON = 'Record in-person verification' as const

export const IN_PERSON_REVOKE_BUTTON = 'Revoke in-person verification' as const

export const IN_PERSON_REVOCATION_EXPLANATION =
  'Revoking removes only the in-person record. If Stripe Identity remains verified, accepted identity stays verified. This does not approve or reject membership, change a subscription, or lift a suspension.' as const

const NOTE_MAX_LENGTH = 280
const SENSITIVE_IDENTITY_TEXT = /\d{6,}/

export function inPersonTextContainsDocumentData(value: string): boolean {
  return SENSITIVE_IDENTITY_TEXT.test(value)
}

type AdminClient = SupabaseClient<Database>

export type ActiveInPersonIdentity = {
  id: string
  source: InPersonIdentitySource
  approvedAt: string | null
  reconciledAt: string | null
  hasApprover: boolean
  verifierName: string | null
  note: string | null
}

export type InPersonIdentityHistoryEntry = {
  id: string
  recordedAt: string | null
  verifierName: string | null
  revokedAt: string
  revokerName: string | null
  reason: string | null
}

export function acceptedIdentityForAdmin(input: {
  stripeStatus: string | null
  lookupOk: boolean
  active: boolean
}): AcceptedIdentityStatus {
  return acceptedIdentityStatus({
    stripeStatus: input.stripeStatus,
    inPersonLookup: input.lookupOk
      ? {
          ok: true,
          record: input.active
            ? { status: 'verified', revokedAt: null }
            : null,
        }
      : { ok: false },
  })
}

export function adminIdentitySourceLabels(input: {
  stripeStatus: string | null
  active: boolean
}): Array<'Stripe Identity' | 'In-person record'> {
  const sources: Array<'Stripe Identity' | 'In-person record'> = []
  if (input.stripeStatus === 'verified') sources.push('Stripe Identity')
  if (input.active) sources.push('In-person record')
  return sources
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
    verifierName: null,
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
    // A repeat does not create another active row and does not backfill a
    // missing audit. Reconciling that gap is a separate moderation insert.
    return { ok: true, alreadyVerified: true }
  }

  const note = normalizeNote(input.note)
  if (note && inPersonTextContainsDocumentData(note)) {
    return {
      ok: false,
      error: 'Do not store document numbers or biometric data in the note.',
    }
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
      note,
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
    tolerateMissingTable: false,
  })
  if (!audit.ok) {
    return { ok: false, error: 'In-person verification was saved, but the audit record failed.' }
  }

  return { ok: true, alreadyVerified: false }
}

export function revocationReasonError(reason: string | null | undefined): string | null {
  const trimmed = reason?.trim() ?? ''
  if (!trimmed) return 'A revocation reason is required.'
  if (trimmed.length > NOTE_MAX_LENGTH) {
    return `Keep the revocation reason to ${NOTE_MAX_LENGTH} characters.`
  }
  if (inPersonTextContainsDocumentData(trimmed)) {
    return 'Do not include document numbers or biometric data.'
  }
  return null
}

export async function revokeInPersonIdentity(
  admin: AdminClient,
  input: {
    isAdmin: boolean
    actorId: string
    profileId: string
    reason: string
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.isAdmin) {
    return { ok: false, error: IN_PERSON_IDENTITY_NOT_AUTHORIZED }
  }
  if (!input.actorId || !input.profileId) {
    return { ok: false, error: IN_PERSON_IDENTITY_NOT_AUTHORIZED }
  }
  const reasonError = revocationReasonError(input.reason)
  if (reasonError) return { ok: false, error: reasonError }
  const reason = input.reason.trim()

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
    reason,
    details: JSON.stringify({ method: IN_PERSON_IDENTITY_METHOD }),
    tolerateMissingTable: false,
  })
  if (!audit.ok) {
    return { ok: false, error: 'In-person verification was revoked, but the audit record failed.' }
  }

  return { ok: true }
}

type InPersonAdminRow = {
  id: string
  source: string
  approved_by: string | null
  approved_at: string | null
  reconciled_at: string | null
  note: string | null
  status: string
  revoked_at: string | null
  revoked_by: string | null
}

function isKnownInPersonSource(
  source: string
): source is InPersonIdentitySource {
  return (
    source === 'admin_action' ||
    source === 'legacy_approval_gates.identity_verified'
  )
}

export function toInPersonIdentityAdminState(input: {
  rows: InPersonAdminRow[] | null
  names: ReadonlyMap<string, string>
  reasons: ReadonlyMap<string, string>
}): {
  lookupOk: boolean
  active: ActiveInPersonIdentity | null
  history: InPersonIdentityHistoryEntry[]
} {
  const rows = (input.rows ?? []).filter((row) => isKnownInPersonSource(row.source))
  const activeRows = rows.filter(
    (row) => row.status === 'verified' && !row.revoked_at
  )
  if (activeRows.length > 1) {
    return { lookupOk: false, active: null, history: [] }
  }

  const activeRow = activeRows[0]
  const active: ActiveInPersonIdentity | null = activeRow
    ? {
        id: activeRow.id,
        source: activeRow.source as InPersonIdentitySource,
        approvedAt: activeRow.approved_at,
        reconciledAt: activeRow.reconciled_at,
        hasApprover: Boolean(activeRow.approved_by),
        verifierName: activeRow.approved_by
          ? (input.names.get(activeRow.approved_by) ?? null)
          : null,
        note: activeRow.note,
      }
    : null

  const history = rows
    .filter(
      (row): row is InPersonAdminRow & { revoked_at: string } =>
        row.status === 'revoked' && Boolean(row.revoked_at)
    )
    .map((row) => ({
      id: row.id,
      recordedAt: row.approved_at ?? row.reconciled_at,
      verifierName: row.approved_by
        ? (input.names.get(row.approved_by) ?? null)
        : null,
      revokedAt: row.revoked_at,
      revokerName: row.revoked_by
        ? (input.names.get(row.revoked_by) ?? null)
        : null,
      reason: input.reasons.get(row.id) ?? null,
    }))
    .sort((left, right) => right.revokedAt.localeCompare(left.revokedAt))

  return { lookupOk: true, active, history }
}

export async function loadInPersonIdentityAdminState(
  admin: AdminClient | null | undefined,
  profileId: string
): Promise<{
  lookupOk: boolean
  active: ActiveInPersonIdentity | null
  history: InPersonIdentityHistoryEntry[]
}> {
  if (!admin || !profileId) {
    return { lookupOk: false, active: null, history: [] }
  }

  const { data, error } = await admin
    .from('in_person_identity_verifications')
    .select(
      'id, source, approved_by, approved_at, reconciled_at, note, status, revoked_at, revoked_by'
    )
    .eq('profile_id', profileId)

  if (error) {
    if (!isMissingRelation(error)) {
      console.error('[identity] in-person history could not be loaded')
    }
    return { lookupOk: false, active: null, history: [] }
  }

  const rows = data ?? []
  const ids = [
    ...new Set(
      rows.flatMap((row) =>
        [row.approved_by, row.revoked_by].filter((id): id is string => Boolean(id))
      )
    ),
  ]
  const names = new Map<string, string>()
  if (ids.length > 0) {
    const named = await admin
      .from('profiles')
      .select('id, full_name')
      .in('id', ids)
    if (!named.error) {
      for (const profile of named.data ?? []) {
        const name = profile.full_name?.trim()
        if (name) names.set(profile.id, name)
      }
    }
  }

  const reasons = new Map<string, string>()
  const audits = await admin
    .from('moderation_actions')
    .select('source_id, reason, created_at')
    .eq('target_member_id', profileId)
    .eq('action_type', 'in_person_identity_revoked')
  if (!audits.error) {
    const sorted = [...(audits.data ?? [])].sort((left, right) =>
      left.created_at.localeCompare(right.created_at)
    )
    for (const audit of sorted) {
      const reason = audit.reason?.trim()
      if (audit.source_id && reason) reasons.set(audit.source_id, reason)
    }
  }

  return toInPersonIdentityAdminState({ rows, names, reasons })
}
