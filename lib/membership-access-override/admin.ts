import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { logModerationAction } from '@/lib/moderation-actions'
import {
  ADMIN_NOT_AUTHORIZED_ERROR,
  denyNonAdminMembershipAccessOverride,
  isActiveMembershipAccessOverride,
  isMembershipAccessOverrideTier,
  membershipAccessOverrideAuditDetails,
  sameOverridePayload,
  type MembershipAccessOverride,
  type SlimMembershipAccessOverride,
} from '@/lib/membership-access-override'

type OverrideRow = Database['public']['Tables']['membership_access_overrides']['Row']

function isMissingRelationError(error: {
  code?: string
  message?: string
} | null): boolean {
  if (!error) return false
  if (error.code === '42P01' || error.code === '42703') return true
  const message = error.message?.toLowerCase() ?? ''
  return message.includes('does not exist') || message.includes('schema cache')
}

function mapOverrideRow(row: OverrideRow): MembershipAccessOverride | null {
  if (!isMembershipAccessOverrideTier(row.tier)) return null
  return {
    id: row.id,
    userId: row.user_id,
    tier: row.tier,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    reason: row.reason,
    grantedBy: row.granted_by,
    revokedAt: row.revoked_at,
    revokedBy: row.revoked_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function normalizeExpiresAt(value: string | null | undefined): string | null {
  const trimmed = value?.trim() || null
  if (!trimmed) return null
  const parsed = Date.parse(
    /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
      ? `${trimmed}T23:59:59.000`
      : trimmed
  )
  if (Number.isNaN(parsed)) return null
  return new Date(parsed).toISOString()
}

export async function loadMembershipAccessOverrideForUser(
  admin: SupabaseClient<Database>,
  input: { isAdmin: boolean; memberId: string }
): Promise<
  | { ok: true; override: MembershipAccessOverride | null }
  | { ok: false; error: string }
> {
  const denied = denyNonAdminMembershipAccessOverride(input.isAdmin)
  if (denied) {
    return { ok: false, error: denied }
  }

  const { data, error } = await admin
    .from('membership_access_overrides')
    .select(
      'id, user_id, tier, starts_at, expires_at, reason, granted_by, revoked_at, revoked_by, created_at, updated_at'
    )
    .eq('user_id', input.memberId)
    .is('revoked_at', null)
    .maybeSingle()

  if (error) {
    if (isMissingRelationError(error)) {
      return { ok: true, override: null }
    }
    return { ok: false, error: error.message }
  }

  return { ok: true, override: data ? mapOverrideRow(data) : null }
}

export async function loadActiveMembershipAccessOverride(
  admin: SupabaseClient<Database> | null | undefined,
  userId: string,
  now: Date = new Date()
): Promise<SlimMembershipAccessOverride | null> {
  if (!admin || !userId) return null

  const { data, error } = await admin
    .from('membership_access_overrides')
    .select('tier, starts_at, expires_at, revoked_at')
    .eq('user_id', userId)
    .is('revoked_at', null)
    .maybeSingle()

  if (error || !data) {
    return null
  }
  if (!isMembershipAccessOverrideTier(data.tier)) {
    return null
  }

  const slim: SlimMembershipAccessOverride = {
    tier: data.tier,
    startsAt: data.starts_at,
    expiresAt: data.expires_at,
    revokedAt: data.revoked_at,
  }
  return isActiveMembershipAccessOverride(slim, now) ? slim : null
}

export async function loadActiveMembershipAccessOverridesByUserIds(
  admin: SupabaseClient<Database> | null | undefined,
  userIds: string[],
  now: Date = new Date()
): Promise<Map<string, SlimMembershipAccessOverride>> {
  const map = new Map<string, SlimMembershipAccessOverride>()
  const uniqueIds = [...new Set(userIds.filter(Boolean))]
  if (!admin || uniqueIds.length === 0) return map

  const { data, error } = await admin
    .from('membership_access_overrides')
    .select('user_id, tier, starts_at, expires_at, revoked_at')
    .in('user_id', uniqueIds)
    .is('revoked_at', null)

  if (error || !data) return map

  for (const row of data) {
    if (!isMembershipAccessOverrideTier(row.tier)) continue
    const slim: SlimMembershipAccessOverride = {
      tier: row.tier,
      startsAt: row.starts_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
    }
    if (isActiveMembershipAccessOverride(slim, now)) {
      map.set(row.user_id, slim)
    }
  }

  return map
}

export async function grantMembershipAccessOverride(
  admin: SupabaseClient<Database>,
  input: {
    isAdmin: boolean
    actorId: string
    memberId: string
    tier: string
    expiresAt?: string | null
    reason?: string | null
    startsAt?: string | null
  }
): Promise<
  | { ok: true; granted: boolean; updated: boolean; alreadyActive: boolean }
  | { ok: false; error: string }
> {
  const denied = denyNonAdminMembershipAccessOverride(input.isAdmin)
  if (denied) {
    return { ok: false, error: denied }
  }

  if (!isMembershipAccessOverrideTier(input.tier)) {
    return { ok: false, error: 'Choose Inner Circle or Elite Circle complimentary access.' }
  }

  const expiresAt = normalizeExpiresAt(input.expiresAt)
  const reason = input.reason?.trim() || null
  const startsAt = normalizeExpiresAt(input.startsAt) ?? new Date().toISOString()

  if (expiresAt && Date.parse(expiresAt) <= Date.parse(startsAt)) {
    return { ok: false, error: 'Expiration must be after the start time.' }
  }

  const loaded = await loadMembershipAccessOverrideForUser(admin, {
    isAdmin: true,
    memberId: input.memberId,
  })
  if (!loaded.ok) {
    return loaded
  }

  const existing = loaded.override
  if (
    existing &&
    sameOverridePayload(existing, { tier: input.tier, expiresAt, reason })
  ) {
    return { ok: true, granted: false, updated: false, alreadyActive: true }
  }

  if (existing) {
    const { error: updateError } = await admin
      .from('membership_access_overrides')
      .update({
        tier: input.tier,
        expires_at: expiresAt,
        reason,
      })
      .eq('id', existing.id)
      .is('revoked_at', null)

    if (updateError) {
      return { ok: false, error: updateError.message }
    }

    const audit = await logModerationAction(admin, {
      actorId: input.actorId,
      targetMemberId: input.memberId,
      actionType: 'membership_access_override_updated',
      sourceType: 'membership_access_override',
      sourceId: existing.id,
      reason: 'Admin updated complimentary membership access override',
      details: membershipAccessOverrideAuditDetails({
        tier: input.tier,
        startsAt: existing.startsAt,
        expiresAt,
        reason,
      }),
    })
    if (!audit.ok) {
      return { ok: false, error: `Could not write moderation audit log: ${audit.error}` }
    }

    return { ok: true, granted: false, updated: true, alreadyActive: false }
  }

  const { data: inserted, error: insertError } = await admin
    .from('membership_access_overrides')
    .insert({
      user_id: input.memberId,
      tier: input.tier,
      starts_at: startsAt,
      expires_at: expiresAt,
      reason,
      granted_by: input.actorId,
    })
    .select('id')
    .maybeSingle()

  if (insertError) {
    if (insertError.code === '23505') {
      return { ok: true, granted: false, updated: false, alreadyActive: true }
    }
    return { ok: false, error: insertError.message }
  }

  const audit = await logModerationAction(admin, {
    actorId: input.actorId,
    targetMemberId: input.memberId,
    actionType: 'membership_access_override_granted',
    sourceType: 'membership_access_override',
    sourceId: inserted?.id ?? input.memberId,
    reason: 'Admin granted complimentary membership access override',
    details: membershipAccessOverrideAuditDetails({
      tier: input.tier,
      startsAt,
      expiresAt,
      reason,
    }),
  })
  if (!audit.ok) {
    return { ok: false, error: `Could not write moderation audit log: ${audit.error}` }
  }

  return { ok: true, granted: true, updated: false, alreadyActive: false }
}

export async function revokeMembershipAccessOverride(
  admin: SupabaseClient<Database>,
  input: { isAdmin: boolean; actorId: string; memberId: string }
): Promise<{ ok: true; revoked: boolean } | { ok: false; error: string }> {
  const denied = denyNonAdminMembershipAccessOverride(input.isAdmin)
  if (denied) {
    return { ok: false, error: denied }
  }

  const { data: updated, error: updateError } = await admin
    .from('membership_access_overrides')
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: input.actorId,
    })
    .eq('user_id', input.memberId)
    .is('revoked_at', null)
    .select('id, tier, starts_at, expires_at, reason')

  if (updateError) {
    if (isMissingRelationError(updateError)) {
      return { ok: true, revoked: false }
    }
    return { ok: false, error: updateError.message }
  }

  if (!updated?.length) {
    return { ok: true, revoked: false }
  }

  const row = updated[0]
  const tier = isMembershipAccessOverrideTier(row.tier)
    ? row.tier
    : 'inner_circle'
  const audit = await logModerationAction(admin, {
    actorId: input.actorId,
    targetMemberId: input.memberId,
    actionType: 'membership_access_override_revoked',
    sourceType: 'membership_access_override',
    sourceId: row.id,
    reason: 'Admin revoked complimentary membership access override',
    details: membershipAccessOverrideAuditDetails({
      tier,
      startsAt: row.starts_at,
      expiresAt: row.expires_at,
      reason: row.reason,
    }),
  })
  if (!audit.ok) {
    return { ok: false, error: `Could not write moderation audit log: ${audit.error}` }
  }

  return { ok: true, revoked: true }
}

export { ADMIN_NOT_AUTHORIZED_ERROR }
