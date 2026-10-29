import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
  acceptedIdentityStatus,
  type AcceptedIdentityStatus,
  type InPersonIdentitySource,
} from '@/lib/identity-verification'

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

function identityRpcError(
  message: string,
  fallback: string
): string {
  if (
    message.includes('Administrator access required') ||
    message.includes('authentication required')
  ) {
    return IN_PERSON_IDENTITY_NOT_AUTHORIZED
  }
  if (message.includes('Confirm the in-person identity check')) {
    return 'Confirm the in-person identity check before recording it.'
  }
  if (message.includes('Member not found')) return 'Member not found.'
  if (message.includes('No in-person identity verification is active')) {
    return 'No in-person identity verification is active.'
  }
  if (message.includes('A revocation reason is required')) {
    return 'A revocation reason is required.'
  }
  if (message.includes('280 characters')) {
    return 'Keep the revocation reason to 280 characters.'
  }
  if (message.includes('document numbers')) {
    return 'Do not include document numbers or biometric data.'
  }
  return fallback
}

function alreadyVerifiedResult(data: unknown): boolean {
  if (!data || typeof data !== 'object' || !('already_verified' in data)) {
    return false
  }
  return (data as { already_verified?: unknown }).already_verified === true
}

export async function approveInPersonIdentity(
  supabase: AdminClient,
  input: { profileId: string; confirmed: boolean }
): Promise<
  | { ok: true; alreadyVerified: boolean }
  | { ok: false; error: string }
> {
  if (input.confirmed !== true) {
    return {
      ok: false,
      error: 'Confirm the in-person identity check before recording it.',
    }
  }
  if (!input.profileId) return { ok: false, error: 'Member not found.' }

  const { data, error } = await supabase.rpc(
    'record_in_person_identity_verification',
    {
      target_profile_id: input.profileId,
      confirmed: true,
    }
  )
  if (error) {
    return {
      ok: false,
      error: identityRpcError(
        error.message,
        'Could not record in-person identity verification.'
      ),
    }
  }
  return { ok: true, alreadyVerified: alreadyVerifiedResult(data) }
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
  supabase: AdminClient,
  input: { profileId: string; reason: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const reasonError = revocationReasonError(input.reason)
  if (reasonError) return { ok: false, error: reasonError }
  if (!input.profileId) return { ok: false, error: 'Member not found.' }

  const { error } = await supabase.rpc(
    'revoke_in_person_identity_verification',
    {
      target_profile_id: input.profileId,
      reason: input.reason.trim(),
    }
  )
  if (error) {
    return {
      ok: false,
      error: identityRpcError(
        error.message,
        'Could not revoke in-person identity verification.'
      ),
    }
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
