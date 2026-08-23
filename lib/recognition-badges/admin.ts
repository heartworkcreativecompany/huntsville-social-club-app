import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { logModerationAction } from '@/lib/moderation-actions'
import {
  ADMIN_NOT_AUTHORIZED_ERROR,
  recognitionBadgeAuditDetails,
  type AdminRecognitionBadgeAward,
  type RecognitionBadgeCatalogEntry,
} from '@/lib/recognition-badges/catalog'

export type AdminMemberBadgeState = {
  member: {
    id: string
    fullName: string
    email: string | null
  }
  catalog: RecognitionBadgeCatalogEntry[]
  activeAwards: AdminRecognitionBadgeAward[]
}

export function denyNonAdminBadgeAccess(isAdmin: boolean): string | null {
  if (isAdmin) return null
  return ADMIN_NOT_AUTHORIZED_ERROR
}

export async function loadAdminMemberBadges(
  admin: SupabaseClient<Database>,
  input: { isAdmin: boolean; memberId: string }
): Promise<
  | { ok: true; data: AdminMemberBadgeState }
  | { ok: false; error: string }
> {
  const denied = denyNonAdminBadgeAccess(input.isAdmin)
  if (denied) {
    return { ok: false, error: denied }
  }

  const { data: member, error: memberError } = await admin
    .from('profiles')
    .select('id, full_name, email')
    .eq('id', input.memberId)
    .maybeSingle()

  if (memberError) {
    return { ok: false, error: memberError.message }
  }
  if (!member) {
    return { ok: false, error: 'Member not found.' }
  }

  const { data: catalogRows, error: catalogError } = await admin
    .from('recognition_badges')
    .select(
      'slug, public_label, public_description, display_order, active'
    )
    .order('display_order', { ascending: true })

  if (catalogError) {
    return { ok: false, error: catalogError.message }
  }

  const catalog: RecognitionBadgeCatalogEntry[] = (catalogRows ?? []).map(
    (row) => ({
      slug: row.slug,
      publicLabel: row.public_label,
      publicDescription: row.public_description,
      displayOrder: row.display_order,
      active: row.active,
    })
  )
  const catalogBySlug = new Map(catalog.map((entry) => [entry.slug, entry]))

  const { data: awardRows, error: awardError } = await admin
    .from('member_recognition_badge_awards')
    .select(
      'badge_slug, awarded_at, awarded_by, admin_note, revoked_at'
    )
    .eq('user_id', input.memberId)
    .is('revoked_at', null)
    .order('awarded_at', { ascending: true })

  if (awardError) {
    return { ok: false, error: awardError.message }
  }

  const activeAwards: AdminRecognitionBadgeAward[] = []
  for (const row of awardRows ?? []) {
    const entry = catalogBySlug.get(row.badge_slug)
    if (!entry) continue
    activeAwards.push({
      slug: entry.slug,
      publicLabel: entry.publicLabel,
      publicDescription: entry.publicDescription,
      displayOrder: entry.displayOrder,
      awardedAt: row.awarded_at,
      awardedBy: row.awarded_by,
      adminNote: row.admin_note,
    })
  }

  return {
    ok: true,
    data: {
      member: {
        id: member.id,
        fullName: member.full_name?.trim() || member.email || 'Member',
        email: member.email,
      },
      catalog,
      activeAwards,
    },
  }
}

export async function awardRecognitionBadges(
  admin: SupabaseClient<Database>,
  input: {
    isAdmin: boolean
    actorId: string
    memberId: string
    slugs: string[]
    adminNote?: string | null
  }
): Promise<
  | { ok: true; awarded: string[]; alreadyAwarded: string[] }
  | { ok: false; error: string }
> {
  const denied = denyNonAdminBadgeAccess(input.isAdmin)
  if (denied) {
    return { ok: false, error: denied }
  }

  const uniqueSlugs = [...new Set(input.slugs.map((slug) => slug.trim()).filter(Boolean))]
  if (uniqueSlugs.length === 0) {
    return { ok: false, error: 'Select at least one catalog badge to award.' }
  }

  const { data: catalogRows, error: catalogError } = await admin
    .from('recognition_badges')
    .select('slug, public_label, active')
    .in('slug', uniqueSlugs)

  if (catalogError) {
    return { ok: false, error: catalogError.message }
  }

  const catalogBySlug = new Map(
    (catalogRows ?? []).map((row) => [row.slug, row])
  )
  for (const slug of uniqueSlugs) {
    const entry = catalogBySlug.get(slug)
    if (!entry) {
      return { ok: false, error: `Unknown badge: ${slug}` }
    }
    if (!entry.active) {
      return { ok: false, error: `${entry.public_label} is not an active catalog badge.` }
    }
  }

  const { data: existingRows, error: existingError } = await admin
    .from('member_recognition_badge_awards')
    .select('badge_slug')
    .eq('user_id', input.memberId)
    .in('badge_slug', uniqueSlugs)
    .is('revoked_at', null)

  if (existingError) {
    return { ok: false, error: existingError.message }
  }

  const alreadyAwarded = new Set(
    (existingRows ?? []).map((row) => row.badge_slug)
  )
  const toAward = uniqueSlugs.filter((slug) => !alreadyAwarded.has(slug))
  const note = input.adminNote?.trim() || null
  const awarded: string[] = []

  for (const slug of toAward) {
    const entry = catalogBySlug.get(slug)
    if (!entry) continue

    const { error: insertError } = await admin
      .from('member_recognition_badge_awards')
      .insert({
        user_id: input.memberId,
        badge_slug: slug,
        awarded_by: input.actorId,
        admin_note: note,
      })

    if (insertError) {
      if (insertError.code === '23505') {
        alreadyAwarded.add(slug)
        continue
      }
      return { ok: false, error: insertError.message }
    }

    const audit = await logModerationAction(admin, {
      actorId: input.actorId,
      targetMemberId: input.memberId,
      actionType: 'recognition_badge_awarded',
      sourceType: 'recognition_badge',
      sourceId: slug,
      reason: 'Admin awarded public recognition badge',
      details: recognitionBadgeAuditDetails({
        slug,
        publicLabel: entry.public_label,
        adminNote: note,
      }),
    })
    if (!audit.ok) {
      return { ok: false, error: `Could not write moderation audit log: ${audit.error}` }
    }
    awarded.push(slug)
  }

  return {
    ok: true,
    awarded,
    alreadyAwarded: uniqueSlugs.filter((slug) => !awarded.includes(slug)),
  }
}

export async function revokeRecognitionBadge(
  admin: SupabaseClient<Database>,
  input: {
    isAdmin: boolean
    actorId: string
    memberId: string
    slug: string
  }
): Promise<{ ok: true; revoked: boolean } | { ok: false; error: string }> {
  const denied = denyNonAdminBadgeAccess(input.isAdmin)
  if (denied) {
    return { ok: false, error: denied }
  }

  const slug = input.slug.trim()
  if (!slug) {
    return { ok: false, error: 'Badge is required.' }
  }

  const { data: catalogRow, error: catalogError } = await admin
    .from('recognition_badges')
    .select('slug, public_label')
    .eq('slug', slug)
    .maybeSingle()

  if (catalogError) {
    return { ok: false, error: catalogError.message }
  }
  if (!catalogRow) {
    return { ok: false, error: `Unknown badge: ${slug}` }
  }

  const { data: updated, error: updateError } = await admin
    .from('member_recognition_badge_awards')
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: input.actorId,
    })
    .eq('user_id', input.memberId)
    .eq('badge_slug', slug)
    .is('revoked_at', null)
    .select('id')

  if (updateError) {
    return { ok: false, error: updateError.message }
  }

  if (!updated?.length) {
    return { ok: true, revoked: false }
  }

  const audit = await logModerationAction(admin, {
    actorId: input.actorId,
    targetMemberId: input.memberId,
    actionType: 'recognition_badge_revoked',
    sourceType: 'recognition_badge',
    sourceId: slug,
    reason: 'Admin revoked public recognition badge',
    details: recognitionBadgeAuditDetails({
      slug,
      publicLabel: catalogRow.public_label,
    }),
  })
  if (!audit.ok) {
    return { ok: false, error: `Could not write moderation audit log: ${audit.error}` }
  }

  return { ok: true, revoked: true }
}
