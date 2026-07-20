import { isCompatibilityFeatureEnabled } from '@/lib/compatibility/eligibility'
import {
  isEligibleRecipient,
  type MatchPoolProfile,
} from '@/lib/compatibility/match-candidate-pool'
import { isDueForMatchGeneration } from '@/lib/compatibility/match-delivery-scheduler'

export function canAttemptAutoGenerate(profile: MatchPoolProfile): {
  ok: true
} | {
  ok: false
  reason: string
} {
  if (!isCompatibilityFeatureEnabled()) {
    return { ok: false, reason: 'Compatibility matching is disabled.' }
  }

  if (!isEligibleRecipient(profile)) {
    return { ok: false, reason: 'Member is not eligible for curated matches.' }
  }

  if (!isDueForMatchGeneration(
    profile.last_match_generation_at,
    Date.now(),
    profile.last_match_review_at
  )) {
    return {
      ok: false,
      reason: 'Member is inside the recurring delivery interval.',
    }
  }

  return { ok: true }
}
