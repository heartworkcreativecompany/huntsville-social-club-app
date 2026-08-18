/**
 * View-model helpers for the admin member-application detail page.
 * Keeps field mapping explicit so UI labels cannot drift from draft data.
 */

import type { ApplicationDraft } from '@/lib/application'
import { APPLICATION_PROMPTS } from '@/lib/application-form-content'
import { memberPublicIntentLabelsFromValues } from '@/lib/member-public-intent'

export type AdminApplicationAboutRow = {
  key: string
  label: string
  value: string
}

/**
 * profiles.membership_intent is a legacy column name. It is populated from
 * draft.profile.aboutMe (public bio), not from connection/membership intent.
 */
export function bioFromMembershipIntentColumn(
  membershipIntent: string | null | undefined
): string {
  return membershipIntent?.trim() ?? ''
}

/** Public bio for the About you card — never labeled "Intent". */
export function adminApplicationBio(draft: ApplicationDraft): string {
  return draft.profile.aboutMe.trim()
}

/**
 * About you rows: dedicated Bio first, then short-answer prompts.
 * Looking-for / connection intents belong on Profile basics, not here.
 */
export function adminApplicationAboutRows(
  draft: ApplicationDraft
): AdminApplicationAboutRow[] {
  const rows: AdminApplicationAboutRow[] = [
    {
      key: 'bio',
      label: 'Bio',
      value: adminApplicationBio(draft) || '—',
    },
  ]

  for (const prompt of APPLICATION_PROMPTS) {
    rows.push({
      key: prompt.key,
      label: prompt.label,
      value: draft.prompts[prompt.key]?.trim() || '—',
    })
  }

  return rows
}

/** True connection/looking-for intents (not the bio column). */
export function adminApplicationLookingForLabel(
  draft: ApplicationDraft
): string {
  return (
    memberPublicIntentLabelsFromValues(draft.profile.connectionIntents).join(
      ', '
    ) || '—'
  )
}

/**
 * Vendor/premium verification is for Business Directory / vendor workflows,
 * not standard member membership applications.
 */
export function showPremiumVendorVerificationOnMemberApplication(): boolean {
  return false
}

export const ADMIN_MEMBER_APPLICATION_DETAIL_SECTIONS = [
  'profile_basics',
  'location',
  'work_and_interests',
  'about_you',
  'photos',
  'approval_requirements',
  'locality',
  'vouches',
  'billing',
  'review_actions',
  'remove_member',
] as const

export type AdminMemberApplicationDetailSection =
  (typeof ADMIN_MEMBER_APPLICATION_DETAIL_SECTIONS)[number]

export function adminMemberApplicationDetailSections(options?: {
  includeRemoveMember?: boolean
}): AdminMemberApplicationDetailSection[] {
  const sections: AdminMemberApplicationDetailSection[] = [
    'profile_basics',
    'location',
    'work_and_interests',
    'about_you',
    'photos',
    'approval_requirements',
    'locality',
    'vouches',
    'billing',
    'review_actions',
  ]

  if (options?.includeRemoveMember) {
    sections.push('remove_member')
  }

  return sections
}
