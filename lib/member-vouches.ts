export type VouchType = 'personal' | 'professional' | 'community'

export type VouchStatus = 'pending' | 'approved' | 'rejected'

export type MemberVouch = {
  id: string
  voucher_id: string
  vouchee_id: string
  vouch_type: VouchType
  relationship_context: string
  note: string | null
  status: VouchStatus
  created_at: string
  updated_at: string
  moderated_at: string | null
  moderated_by: string | null
  moderation_reason: string | null
}

export const VOUCH_TYPE_OPTIONS: {
  value: VouchType
  label: string
  summaryLabel: string
  description: string
}[] = [
  {
    value: 'personal',
    label: 'Personal',
    summaryLabel: 'Personally vouched for',
    description:
      'You know this member personally and would introduce them in a social setting.',
  },
  {
    value: 'professional',
    label: 'Professional',
    summaryLabel: 'Professionally vouched for',
    description:
      'You have worked with or professionally interacted with this member.',
  },
  {
    value: 'community',
    label: 'Community',
    summaryLabel: 'Known in the community',
    description:
      'You have seen this member contribute positively in local or club community contexts.',
  },
]

export const VOUCH_RELATIONSHIP_OPTIONS = [
  'Met through club events',
  'Introduced by another member',
  'Professional colleague',
  'Friend outside the club',
  'Community organization',
  'Shared activity or hobby',
  'Other',
] as const

export type VouchSummary = {
  personal: number
  professional: number
  community: number
  total: number
}

export function emptyVouchSummary(): VouchSummary {
  return { personal: 0, professional: 0, community: 0, total: 0 }
}

export function isPublicVouchStatus(status: string | null | undefined): boolean {
  return status === 'approved'
}

export function vouchModerationAllowed(role: string | null | undefined): boolean {
  return role === 'admin'
}

/**
 * Changing an approved written endorsement takes it off the profile
 * until an admin approves the new text.
 */
export function endorsementEditRequiresRereview(input: {
  previousStatus: VouchStatus | string
  previousNote: string | null
  nextNote: string | null
}): boolean {
  if (input.previousStatus !== 'approved') return false
  return (input.previousNote ?? '') !== (input.nextNote ?? '')
}

export function summarizeVouches(
  rows: Pick<MemberVouch, 'vouch_type' | 'status'>[]
): VouchSummary {
  const summary = emptyVouchSummary()
  for (const row of rows) {
    if (!isPublicVouchStatus(row.status)) continue
    if (row.vouch_type === 'personal') summary.personal += 1
    if (row.vouch_type === 'professional') summary.professional += 1
    if (row.vouch_type === 'community') summary.community += 1
  }
  summary.total = summary.personal + summary.professional + summary.community
  return summary
}

export function vouchTypeLabel(type: VouchType): string {
  return VOUCH_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type
}

export function vouchTypeSummaryLabel(type: VouchType): string {
  return (
    VOUCH_TYPE_OPTIONS.find((o) => o.value === type)?.summaryLabel ?? type
  )
}

export const VOUCH_DISCLAIMER =
  'Member vouches are community signals from other approved members. They are not guarantees of safety, compatibility, or conduct.'

export const VOUCH_NOTE_MAX = 200

export type PublicVouchEndorsement = {
  id: string
  vouchType: VouchType
  authorName: string
  approvedAt: string | null
  endorsement: string | null
}
