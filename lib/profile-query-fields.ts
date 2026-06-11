/** Profile SELECT field lists — tiered for graceful schema fallback. */

/** Core columns always expected on profiles. */
export const PROFILE_BASE_FIELDS =
  'id, email, full_name, role, created_at'

/** Application workflow columns (20260522140000). */
export const PROFILE_APPLICATION_FIELDS = [
  PROFILE_BASE_FIELDS,
  'application_status',
  'membership_intent',
  'application_draft',
  'application_submitted_at',
  'application_reviewed_at',
  'verified_at',
  'admin_review_notes',
  'location_area',
  'referral_source',
].join(', ')

/** Membership systems columns (20260529000000) — optional until migration applied. */
export const PROFILE_MEMBERSHIP_SYSTEMS_FIELDS = [
  'verification_state',
  'approval_gates',
  'locality_confirmation',
  'premium_verification',
  'membership_billing',
  'discovery_intent',
  'location_city',
  'location_zip',
  'birth_year',
  'discovery_interests',
  'discovery_industry',
].join(', ')

export const PROFILE_FULL_FIELDS = `${PROFILE_APPLICATION_FIELDS}, ${PROFILE_MEMBERSHIP_SYSTEMS_FIELDS}`

export const DIRECTORY_APPLICATION_FIELDS = [
  PROFILE_BASE_FIELDS,
  'application_status',
  'membership_intent',
  'verified_at',
  'application_draft',
  'location_area',
].join(', ')

export const DIRECTORY_FULL_FIELDS = `${DIRECTORY_APPLICATION_FIELDS}, ${PROFILE_MEMBERSHIP_SYSTEMS_FIELDS}`

export function isMissingSchemaColumnError(
  error: { message?: string } | null
): boolean {
  const msg = error?.message?.toLowerCase() ?? ''
  return msg.includes('does not exist') || msg.includes('column')
}
