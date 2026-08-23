export const RECOGNITION_BADGE_SLUGS = [
  'founding_member',
  'premium_sponsor',
  'experience_partner',
] as const

export type RecognitionBadgeSlug = (typeof RECOGNITION_BADGE_SLUGS)[number]

export const SEEDED_RECOGNITION_BADGES: {
  slug: RecognitionBadgeSlug
  publicLabel: string
  publicDescription: string
  displayOrder: number
}[] = [
  {
    slug: 'founding_member',
    publicLabel: 'Founding Member',
    publicDescription:
      'Recognized as an early member of Huntsville Social Club.',
    displayOrder: 10,
  },
  {
    slug: 'premium_sponsor',
    publicLabel: 'Premium Sponsor',
    publicDescription:
      'Recognized as a premium sponsor of Huntsville Social Club.',
    displayOrder: 20,
  },
  {
    slug: 'experience_partner',
    publicLabel: 'Experience Partner',
    publicDescription:
      'Recognized as an experience partner of Huntsville Social Club.',
    displayOrder: 30,
  },
]

export const PUBLIC_RECOGNITION_BADGE_COLUMNS =
  'user_id, badge_slug, public_label, display_order' as const

export type PublicRecognitionBadge = {
  slug: string
  publicLabel: string
}

export type RecognitionBadgeCatalogEntry = {
  slug: string
  publicLabel: string
  publicDescription: string
  displayOrder: number
  active: boolean
}

export type AdminRecognitionBadgeAward = {
  slug: string
  publicLabel: string
  publicDescription: string
  displayOrder: number
  awardedAt: string
  awardedBy: string
  adminNote: string | null
}

export function isRecognitionBadgeSlug(
  value: string
): value is RecognitionBadgeSlug {
  return (RECOGNITION_BADGE_SLUGS as readonly string[]).includes(value)
}

export function toPublicRecognitionBadges(
  rows: Array<{
    badge_slug?: string | null
    slug?: string | null
    public_label?: string | null
    publicLabel?: string | null
    display_order?: number | null
    admin_note?: string | null
    awarded_by?: string | null
    revoked_by?: string | null
    revoked_at?: string | null
  }>
): PublicRecognitionBadge[] {
  const badges: PublicRecognitionBadge[] = []
  const seen = new Set<string>()

  for (const row of rows) {
    if (row.revoked_at) continue
    const slug = row.badge_slug?.trim() || row.slug?.trim()
    const publicLabel = row.public_label?.trim() || row.publicLabel?.trim()
    if (!slug || !publicLabel || seen.has(slug)) continue
    seen.add(slug)
    badges.push({ slug, publicLabel })
  }

  return badges
}

export function publicRecognitionBadgePayload(
  badges: PublicRecognitionBadge[]
): PublicRecognitionBadge[] {
  return badges.map((badge) => ({
    slug: badge.slug,
    publicLabel: badge.publicLabel,
  }))
}

export function awardRecognitionBadgeConfirmationCopy(
  labels: string[],
  memberName: string
): string {
  const quoted = labels.map((label) => `“${label}”`).join(', ')
  if (labels.length === 1) {
    return `Award ${quoted} to ${memberName}? This is a public recognition label. It does not change membership, billing, or access.`
  }
  return `Award ${quoted} to ${memberName}? These are public recognition labels. They do not change membership, billing, or access.`
}

export function revokeRecognitionBadgeConfirmationCopy(
  label: string,
  memberName: string
): string {
  return `Revoke “${label}” from ${memberName}? This removes the public label. It does not change membership, billing, or access.`
}

export function recognitionBadgeAuditDetails(input: {
  slug: string
  publicLabel: string
  adminNote?: string | null
}): string {
  return JSON.stringify({
    slug: input.slug,
    public_label: input.publicLabel,
    admin_note: input.adminNote?.trim() || null,
  })
}

export const ADMIN_NOT_AUTHORIZED_ERROR =
  'Administrator access required.' as const
