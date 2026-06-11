import { parseApplicationDraft } from '@/lib/application'
import { discoveryColumnsFromDraft } from '@/lib/membership-systems'

type ProfileWithDraft = {
  application_draft?: unknown
  location_area?: string | null
  discovery_intent?: string | null
  location_city?: string | null
  location_zip?: string | null
  birth_year?: number | null
  discovery_interests?: string[] | null
  discovery_industry?: string | null
  verification_state?: unknown
  approval_gates?: unknown
  locality_confirmation?: unknown
  premium_verification?: unknown
  membership_billing?: unknown
}

/**
 * Fill discovery / membership-system fields from application_draft when DB
 * columns are missing or not yet backfilled. Safe to call on every profile row.
 */
export function enrichProfileFromDraft<T extends ProfileWithDraft>(
  profile: T
): T {
  if (!profile.application_draft) {
    return {
      ...profile,
      discovery_interests: profile.discovery_interests ?? [],
    }
  }

  const draft = parseApplicationDraft(profile.application_draft)
  const discovery = discoveryColumnsFromDraft(draft)

  return {
    ...profile,
    location_area:
      profile.location_area?.trim() ||
      draft.location.neighborhoodOrArea.trim() ||
      null,
    discovery_intent:
      profile.discovery_intent ?? discovery.discovery_intent ?? null,
    location_city: profile.location_city ?? discovery.location_city ?? null,
    location_zip: profile.location_zip ?? discovery.location_zip ?? null,
    birth_year: profile.birth_year ?? discovery.birth_year ?? null,
    discovery_interests:
      profile.discovery_interests && profile.discovery_interests.length > 0
        ? profile.discovery_interests
        : discovery.discovery_interests,
    discovery_industry:
      profile.discovery_industry ?? discovery.discovery_industry ?? null,
    locality_confirmation:
      profile.locality_confirmation ?? discovery.locality_confirmation,
  }
}
