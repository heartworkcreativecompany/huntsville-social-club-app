/** Profile SELECT field lists — tiered for graceful schema fallback. */

/** Core columns always expected on profiles. */
export const PROFILE_BASE_FIELDS =
  'id, email, full_name, role, created_at'

/** Directory-safe profile columns — excludes account login email. */
export const DIRECTORY_PROFILE_BASE_FIELDS =
  'id, full_name, role, created_at'

export const PROFILE_CONTACT_EMAIL_FIELDS = 'contact_email, show_contact_email'

export const PROFILE_VERIFIED_PHONE_FIELDS = 'verified_phone_e164'

export const PROFILE_IDENTITY_VERIFICATION_FIELDS = [
  'identity_verification_status',
  'identity_verification_session_id',
  'identity_verified_at',
  'identity_verification_last_error',
].join(', ')

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
  PROFILE_CONTACT_EMAIL_FIELDS,
  PROFILE_VERIFIED_PHONE_FIELDS,
  PROFILE_IDENTITY_VERIFICATION_FIELDS,
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

export const PROFILE_CONNECTION_INTENT_FIELDS = 'connection_intents'

/** Compatibility + connections columns (20260701000000) — not used in directory queries. */
export const PROFILE_COMPATIBILITY_FIELDS = [
  PROFILE_CONNECTION_INTENT_FIELDS,
  'connections_open_to',
  'compatibility_questionnaire',
  'compatibility_completed_at',
  'compatibility_updated_at',
  'wants_curated_matches',
  'curated_matches_paused_at',
  'curated_matches_pause_reason',
  'dating_connection_enabled_at',
  'dating_connection_removed_at',
  'messaging_entitlement_lost_at',
  'messaging_entitlement_restored_at',
  'last_match_generation_at',
  'last_match_review_at',
].join(', ')

/** Messaging moderation columns (20260708000000). */
export const PROFILE_MESSAGING_MODERATION_FIELDS = [
  'messaging_suspended_at',
  'messaging_suspension_reason',
  'messaging_suspended_by',
].join(', ')

/** Profile revision queue columns (20260702000000). */
export const PROFILE_REVISION_FIELDS = [
  'profile_pending_revision',
  'profile_revision_status',
  'profile_revision_submitted_at',
  'profile_revision_reviewed_at',
  'profile_revision_admin_notes',
  'profile_revision_history',
].join(', ')

/** Includes membership_billing — required for entitlements UI. */
export const PROFILE_APPLICATION_WITH_MEMBERSHIP_FIELDS = `${PROFILE_APPLICATION_FIELDS}, ${PROFILE_MEMBERSHIP_SYSTEMS_FIELDS}`

export const PROFILE_APPLICATION_WITH_COMPATIBILITY_FIELDS = `${PROFILE_APPLICATION_WITH_MEMBERSHIP_FIELDS}, ${PROFILE_COMPATIBILITY_FIELDS}`

export const PROFILE_FULL_FIELDS = `${PROFILE_APPLICATION_WITH_COMPATIBILITY_FIELDS}, ${PROFILE_REVISION_FIELDS}, ${PROFILE_MESSAGING_MODERATION_FIELDS}`

/** Ordered fallbacks when optional migrations are not applied yet. */
export const PROFILE_SELECT_TIERS = [
  PROFILE_FULL_FIELDS,
  PROFILE_APPLICATION_WITH_COMPATIBILITY_FIELDS,
  PROFILE_APPLICATION_WITH_MEMBERSHIP_FIELDS,
  PROFILE_APPLICATION_FIELDS,
  PROFILE_BASE_FIELDS,
] as const

/** Profile SELECT tiers for member_profiles view (no account email). */
export const MEMBER_PROFILE_APPLICATION_FIELDS = [
  DIRECTORY_PROFILE_BASE_FIELDS,
  'application_status',
  'membership_intent',
  'application_draft',
  'application_submitted_at',
  'application_reviewed_at',
  'verified_at',
  'admin_review_notes',
  'location_area',
  'referral_source',
  PROFILE_CONTACT_EMAIL_FIELDS,
  PROFILE_VERIFIED_PHONE_FIELDS,
  PROFILE_IDENTITY_VERIFICATION_FIELDS,
].join(', ')

export const MEMBER_PROFILE_APPLICATION_WITH_MEMBERSHIP_FIELDS = `${MEMBER_PROFILE_APPLICATION_FIELDS}, ${PROFILE_MEMBERSHIP_SYSTEMS_FIELDS}`

export const MEMBER_PROFILE_APPLICATION_WITH_COMPATIBILITY_FIELDS = `${MEMBER_PROFILE_APPLICATION_WITH_MEMBERSHIP_FIELDS}, ${PROFILE_COMPATIBILITY_FIELDS}`

export const MEMBER_PROFILE_FULL_FIELDS = `${MEMBER_PROFILE_APPLICATION_WITH_COMPATIBILITY_FIELDS}, ${PROFILE_REVISION_FIELDS}, ${PROFILE_MESSAGING_MODERATION_FIELDS}`

export const MEMBER_PROFILE_SELECT_TIERS = [
  MEMBER_PROFILE_FULL_FIELDS,
  MEMBER_PROFILE_APPLICATION_WITH_COMPATIBILITY_FIELDS,
  MEMBER_PROFILE_APPLICATION_WITH_MEMBERSHIP_FIELDS,
  MEMBER_PROFILE_APPLICATION_FIELDS,
  DIRECTORY_PROFILE_BASE_FIELDS,
] as const

export const DIRECTORY_APPLICATION_FIELDS = [
  DIRECTORY_PROFILE_BASE_FIELDS,
  'application_status',
  'membership_intent',
  'verified_at',
  'application_draft',
  'location_area',
  PROFILE_CONTACT_EMAIL_FIELDS,
].join(', ')

export const DIRECTORY_FULL_FIELDS = `${DIRECTORY_APPLICATION_FIELDS}, ${PROFILE_MEMBERSHIP_SYSTEMS_FIELDS}, ${PROFILE_CONNECTION_INTENT_FIELDS}, connections_open_to`

export function isMissingSchemaColumnError(
  error: { message?: string } | null
): boolean {
  const msg = error?.message?.toLowerCase() ?? ''
  return msg.includes('does not exist') || msg.includes('column')
}
