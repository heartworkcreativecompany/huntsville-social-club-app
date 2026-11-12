/**
 * Member-to-member profile read.
 * public.member_directory_profiles is the only relation a signed-in member
 * may use for someone else's profile. It does not include private columns.
 */
export const MEMBER_DIRECTORY_PROFILES = 'member_directory_profiles' as const

/** Columns the safe view is allowed to expose. Keep this list in sync with the migration. */
export const MEMBER_DIRECTORY_PROFILE_COLUMNS = [
  'id',
  'full_name',
  'role',
  'created_at',
  'application_status',
  'membership_intent',
  'verified_at',
  'location_area',
  'contact_email',
  'show_contact_email',
  'discovery_intent',
  'discovery_interests',
  'discovery_industry',
  'connection_intents',
  'connections_open_to',
  'public_profile',
  'profile_checks_approved',
  'removed_at',
] as const

export const MEMBER_DIRECTORY_PROFILE_FIELDS =
  MEMBER_DIRECTORY_PROFILE_COLUMNS.join(', ')

export const MEMBER_DIRECTORY_NAME_FIELDS = 'id, full_name'

const APPROVED_PROFILE_CHECKS = {
  email: 'approved',
  phone: 'approved',
  profile_reviewed: 'approved',
  photo_reviewed: 'approved',
  locality: 'approved',
} as const

type SafeDirectoryRow = {
  public_profile?: unknown
  profile_checks_approved?: boolean | null
  application_draft?: unknown
  verification_state?: unknown
}

/**
 * Turn a safe-view row into the shape directory and profile screens already render.
 * public_profile is the public slice of the application, not the stored draft.
 * profile_checks_approved becomes the public verified-badge state, not the raw review object.
 */
export function prepareSafeDirectoryRow<T extends SafeDirectoryRow>(
  row: T
): T & {
  application_draft: unknown
  verification_state: Record<string, string>
} {
  const checksApproved = row.profile_checks_approved === true
  return {
    ...row,
    application_draft: row.public_profile ?? null,
    verification_state: checksApproved ? APPROVED_PROFILE_CHECKS : {},
  }
}
