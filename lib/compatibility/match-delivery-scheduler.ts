import { generationIntervalDays } from '@/lib/compatibility/generation-config'
import { lastMatchReviewAnchor } from '@/lib/compatibility/match-review-anchor'
import type { MatchPoolProfile } from '@/lib/compatibility/match-candidate-pool'
import {
  isEligibleRecipient,
  listEligibleRecipients,
} from '@/lib/compatibility/match-candidate-pool'

export function isDueForMatchGeneration(
  lastMatchGenerationAt: string | null | undefined,
  now = Date.now(),
  lastMatchReviewAt?: string | null | undefined
): boolean {
  const anchor = lastMatchReviewAnchor({
    lastMatchGenerationAt,
    lastMatchReviewAt,
  })

  if (!anchor) {
    return true
  }

  const last = new Date(anchor).getTime()
  if (Number.isNaN(last)) {
    return true
  }

  const intervalMs = generationIntervalDays() * 24 * 60 * 60 * 1000
  return now - last >= intervalMs
}

/** When the member becomes eligible for the next scheduled review. Null if due now. */
export function nextMatchDeliveryEligibleAt(
  lastMatchGenerationAt: string | null | undefined,
  now = Date.now(),
  lastMatchReviewAt?: string | null | undefined
): Date | null {
  const anchor = lastMatchReviewAnchor({
    lastMatchGenerationAt,
    lastMatchReviewAt,
  })

  if (!anchor) {
    return null
  }

  const last = new Date(anchor).getTime()
  if (Number.isNaN(last)) {
    return null
  }

  const intervalMs = generationIntervalDays() * 24 * 60 * 60 * 1000
  const next = last + intervalMs
  if (next <= now) {
    return null
  }

  return new Date(next)
}

export function listDueRecipients(
  profiles: MatchPoolProfile[]
): MatchPoolProfile[] {
  return listEligibleRecipients(profiles).filter((profile) =>
    isDueForMatchGeneration(
      profile.last_match_generation_at,
      Date.now(),
      profile.last_match_review_at
    )
  )
}

export function countDueRecipients(profiles: MatchPoolProfile[]): number {
  return listDueRecipients(profiles).length
}

export function isScheduledDeliveryCandidate(profile: MatchPoolProfile): boolean {
  return (
    isEligibleRecipient(profile) &&
    isDueForMatchGeneration(
      profile.last_match_generation_at,
      Date.now(),
      profile.last_match_review_at
    )
  )
}
