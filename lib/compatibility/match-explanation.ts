const EXPLANATION_SIGNALS = [
  {
    keys: ['relationshipIntention', 'relationship_goals'],
    max: 12,
    min: 8,
    highLabel: 'Similar relationship intentions',
    lowLabel: 'Aligned relationship intentions',
  },
  {
    keys: ['faithValues', 'communication_style'],
    max: 10,
    min: 7,
    highLabel: 'Strong shared values',
    lowLabel: 'Compatible values priorities',
  },
  {
    keys: ['valuesVsChemistry'],
    max: 8,
    min: 6,
    highLabel: 'Similar compatibility priorities',
    lowLabel: 'Compatible long-term priorities',
  },
  {
    keys: ['partnershipDailyLife', 'socialRhythm'],
    max: 8,
    min: 5,
    highLabel: 'Similar lifestyle rhythm',
    lowLabel: 'Compatible lifestyle rhythm',
  },
  {
    keys: ['planningSpontaneity', 'saturdayStyle'],
    max: 6,
    min: 4,
    highLabel: 'Similar day-to-day preferences',
    lowLabel: 'Compatible day-to-day preferences',
  },
] as const

const SHARED_INTERESTS_MAX = 10
const SHARED_INTERESTS_MIN = 5
const LOCATION_MAX = 8
const LOCATION_MIN = 8
const AGE_MAX = 8
const AGE_MIN = 4

export type MatchExplanationInput = {
  scoreBreakdown: Record<string, unknown> | null | undefined
  candidateLocationArea?: string | null
  sharedInterestLabels?: string[]
}

function breakdownPoints(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function firstBreakdownPoints(
  breakdown: Record<string, unknown>,
  keys: readonly string[]
): number {
  for (const key of keys) {
    const points = breakdownPoints(breakdown[key])
    if (points > 0) {
      return points
    }
  }
  return 0
}

export function listSharedInterestLabels(
  viewerInterests: string[] | null | undefined,
  candidateInterests: string[] | null | undefined,
  maxLabels = 2
): string[] {
  const viewerNormalized = new Map<string, string>()

  for (const interest of viewerInterests ?? []) {
    const trimmed = interest.trim()
    if (!trimmed) continue
    viewerNormalized.set(trimmed.toLowerCase(), trimmed)
  }

  const shared: string[] = []

  for (const interest of candidateInterests ?? []) {
    const trimmed = interest.trim()
    if (!trimmed) continue
    const canonical = viewerNormalized.get(trimmed.toLowerCase())
    if (!canonical) continue
    if (!shared.includes(canonical)) {
      shared.push(canonical)
    }
    if (shared.length >= maxLabels) {
      break
    }
  }

  return shared
}

function sharedInterestsLabel(
  points: number,
  sharedInterestLabels: string[]
): string {
  if (sharedInterestLabels.length === 1) {
    return `Shared interest: ${sharedInterestLabels[0]}`
  }

  if (sharedInterestLabels.length > 1) {
    return `Shared interests: ${sharedInterestLabels.join(' and ')}`
  }

  if (points >= 8) {
    return 'Several overlapping interests'
  }

  return 'Overlapping interests on your profiles'
}

function locationLabel(candidateLocationArea: string | null | undefined): string {
  const area = candidateLocationArea?.trim()
  if (area) {
    return `Both in the ${area} area`
  }
  return 'Both in the same local area'
}

function ageProximityLabel(points: number): string {
  if (points >= AGE_MAX) {
    return 'Similar age range'
  }
  return 'Close in age'
}

export function deriveMatchExplanations(
  input: MatchExplanationInput
): string[] {
  const breakdown = input.scoreBreakdown
  if (!breakdown || typeof breakdown !== 'object') {
    return []
  }

  if (breakdown.source === 'dev_seed') {
    return []
  }

  if (breakdown.hard_filter_failed || breakdown.incomplete_questionnaire) {
    return []
  }

  const ranked: { points: number; label: string }[] = []

  for (const signal of EXPLANATION_SIGNALS) {
    const points = firstBreakdownPoints(breakdown, signal.keys)
    if (points >= signal.min) {
      ranked.push({
        points,
        label: points >= signal.max ? signal.highLabel : signal.lowLabel,
      })
    }
  }

  const interestPoints = breakdownPoints(breakdown.shared_interests)
  if (interestPoints >= SHARED_INTERESTS_MIN) {
    ranked.push({
      points: interestPoints,
      label: sharedInterestsLabel(
        interestPoints,
        input.sharedInterestLabels ?? []
      ),
    })
  }

  const locationPoints = breakdownPoints(breakdown.location)
  if (locationPoints >= LOCATION_MIN) {
    ranked.push({
      points: locationPoints,
      label: locationLabel(input.candidateLocationArea),
    })
  }

  const agePoints = breakdownPoints(breakdown.age_proximity)
  if (agePoints >= AGE_MIN) {
    ranked.push({
      points: agePoints,
      label: ageProximityLabel(agePoints),
    })
  }

  const labels = [
    ...new Set(
      ranked
        .sort((left, right) => right.points - left.points)
        .map((entry) => entry.label)
    ),
  ]

  return labels.slice(0, 4)
}
