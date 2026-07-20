import { generationIntervalDays } from '@/lib/compatibility/generation-config'
import {
  isDueForMatchGeneration,
  nextMatchDeliveryEligibleAt,
} from '@/lib/compatibility/match-delivery-scheduler'

export type MemberLatestBatch = {
  status: string
  deliveredAt: string | null
  createdAt: string
  emptyReason: string | null
  matchCount: number
}

export type MemberInboxSituation =
  | 'has_active'
  | 'finding_matches'
  | 'no_strong_matches'
  | 'waiting_for_next'
  | 'archived_only'
  | 'messaging_suspended'

export type MemberMatchAvailabilitySummary = {
  situation: MemberInboxSituation
  headline: string
  detail: string
  deliveryLines: string[]
  emptyTitle: string
  emptyDescription: string
}

export type MemberMatchAvailabilityInput = {
  lastMatchGenerationAt: string | null
  lastMatchReviewAt?: string | null
  compatibilityCompletedAt: string | null
  latestBatch: MemberLatestBatch | null
  activeRecommendationCount: number
  archivedRecommendationCount: number
  messagingSuspended: boolean
  now?: number
}

function formatDeliveryDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function memberEmptyReasonDetail(emptyReason: string | null): string {
  if (!emptyReason) {
    return 'Our latest review did not surface any strong enough matches.'
  }

  if (emptyReason.includes('No eligible candidates')) {
    return 'The dating match pool is still growing. We will keep reviewing as more compatible members join.'
  }

  if (emptyReason.includes('minimum compatibility score')) {
    return 'None of the available candidates met our compatibility threshold in the latest review.'
  }

  if (emptyReason.includes('excluded by blocks')) {
    return 'Available candidates were already shown recently or are not available right now.'
  }

  return 'Our latest review did not surface any strong enough matches.'
}

export function deriveMemberInboxSituation(
  input: MemberMatchAvailabilityInput
): MemberInboxSituation {
  if (input.messagingSuspended) {
    return 'messaging_suspended'
  }

  if (input.activeRecommendationCount > 0) {
    return 'has_active'
  }

  if (input.archivedRecommendationCount > 0) {
    return 'archived_only'
  }

  if (input.latestBatch?.status === 'processing') {
    return 'finding_matches'
  }

  const hasSuccessfulDelivery = input.lastMatchGenerationAt != null
  const latestWasEmpty = input.latestBatch?.status === 'empty'

  if (!hasSuccessfulDelivery) {
    if (!input.latestBatch || input.latestBatch.status === 'scheduled') {
      return 'finding_matches'
    }

    if (latestWasEmpty) {
      return 'no_strong_matches'
    }
  }

  if (
    !isDueForMatchGeneration(
      input.lastMatchGenerationAt,
      input.now,
      input.lastMatchReviewAt
    )
  ) {
    return 'waiting_for_next'
  }

  if (latestWasEmpty) {
    return 'no_strong_matches'
  }

  if (!hasSuccessfulDelivery && !input.latestBatch) {
    return 'finding_matches'
  }

  return 'finding_matches'
}

function buildDeliveryLines(input: MemberMatchAvailabilityInput): string[] {
  const lines: string[] = []
  const intervalDays = generationIntervalDays()

  if (input.lastMatchGenerationAt) {
    lines.push(
      `Last match delivery: ${formatDeliveryDate(input.lastMatchGenerationAt)}`
    )
  } else if (input.latestBatch?.status === 'empty') {
    const reviewedAt =
      input.latestBatch.deliveredAt ?? input.latestBatch.createdAt
    lines.push(`Most recent review: no matches (${formatDeliveryDate(reviewedAt)})`)
  } else if (input.compatibilityCompletedAt) {
    lines.push(
      `Questionnaire completed: ${formatDeliveryDate(input.compatibilityCompletedAt)}`
    )
  }

  const nextEligible = nextMatchDeliveryEligibleAt(
    input.lastMatchGenerationAt,
    input.now,
    input.lastMatchReviewAt
  )
  if (nextEligible) {
    lines.push(`Next scheduled review: ${formatDeliveryDate(nextEligible.toISOString())}`)
  } else if (input.lastMatchGenerationAt) {
    lines.push('You are due for the next match review.')
  }

  if (input.activeRecommendationCount > 0 || input.archivedRecommendationCount > 0) {
    lines.push(
      `Inbox: ${input.activeRecommendationCount} active · ${input.archivedRecommendationCount} archived`
    )
  }

  if (lines.length === 0 && input.compatibilityCompletedAt) {
    lines.push(
      `Reviews run about every ${intervalDays} days after your first delivery.`
    )
  }

  return lines
}

export function summarizeMemberMatchAvailability(
  input: MemberMatchAvailabilityInput
): MemberMatchAvailabilitySummary {
  const situation = deriveMemberInboxSituation(input)
  const deliveryLines = buildDeliveryLines(input)
  const emptyReasonDetail = memberEmptyReasonDetail(
    input.latestBatch?.emptyReason ?? null
  )
  const nextEligible = nextMatchDeliveryEligibleAt(
    input.lastMatchGenerationAt,
    input.now,
    input.lastMatchReviewAt
  )
  const nextReviewLabel = nextEligible
    ? formatDeliveryDate(nextEligible.toISOString())
    : null

  switch (situation) {
    case 'has_active': {
      const count = input.activeRecommendationCount
      return {
        situation,
        headline: 'Curated matches active',
        detail:
          count === 1
            ? 'You have 1 active recommendation in your inbox.'
            : `You have ${count} active recommendations in your inbox.`,
        deliveryLines,
        emptyTitle: '',
        emptyDescription: '',
      }
    }

    case 'messaging_suspended':
      return {
        situation,
        headline: 'Curated matches paused',
        detail:
          'Messaging is suspended on your account, so new curated recommendations are on hold until moderation clears your account.',
        deliveryLines,
        emptyTitle: 'New matches are on hold',
        emptyDescription:
          'Your account cannot receive new curated recommendations while messaging is suspended. Contact the club if you have questions.',
      }

    case 'finding_matches':
      return {
        situation,
        headline: 'Looking for matches',
        detail:
          'Your questionnaire is complete. We are reviewing compatible members and will add strong matches to your inbox when found.',
        deliveryLines,
        emptyTitle: 'We are reviewing matches for you',
        emptyDescription:
          'Your compatibility questionnaire is complete. New recommendations usually appear shortly after your first review — check back soon.',
      }

    case 'no_strong_matches':
      return {
        situation,
        headline: 'No strong matches yet',
        detail: `${emptyReasonDetail} We will run another review ${
          nextReviewLabel ? `around ${nextReviewLabel}` : 'on the next scheduled cycle'
        }.`,
        deliveryLines,
        emptyTitle: 'No strong matches in the latest review',
        emptyDescription: `${emptyReasonDetail} New recommendations appear when we find compatible members above our threshold.`,
      }

    case 'waiting_for_next':
      return {
        situation,
        headline: 'Waiting for next review',
        detail: nextReviewLabel
          ? `Your inbox is clear for now. The next scheduled match review is around ${nextReviewLabel}.`
          : 'Your inbox is clear for now. The next scheduled match review will run on the regular cadence.',
        deliveryLines,
        emptyTitle: 'No matches in your inbox right now',
        emptyDescription: nextReviewLabel
          ? `You are between delivery cycles. The next review is scheduled around ${nextReviewLabel}. Archived matches stay below until the next batch.`
          : `Curated recommendations are delivered on a regular cadence (about every ${generationIntervalDays()} days). Your inbox will update after the next review.`,
      }

    case 'archived_only':
      return {
        situation,
        headline: 'No active recommendations',
        detail: nextReviewLabel
          ? `Your archive has recommendations you passed on, that were unavailable, or that expired. The next review is around ${nextReviewLabel}.`
          : 'Your archive has recommendations you passed on, that were unavailable, or that expired. New recommendations will appear after the next review.',
        deliveryLines,
        emptyTitle: 'No active recommendations',
        emptyDescription: nextReviewLabel
          ? `Your current inbox only has archived recommendations. The next scheduled review is around ${nextReviewLabel}.`
          : 'Your current inbox only has archived recommendations. New batches appear after the next scheduled review.',
      }
  }
}
