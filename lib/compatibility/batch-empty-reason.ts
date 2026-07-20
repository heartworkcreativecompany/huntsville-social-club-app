import { MIN_COMPATIBILITY_SCORE } from '@/lib/compatibility/generation-config'

export function summarizeScoreBreakdown(
  breakdown: Record<string, unknown> | null | undefined
): string[] {
  if (!breakdown || typeof breakdown !== 'object') {
    return []
  }

  const labels: Record<string, string> = {
    baseline: 'Baseline',
    communication_style: 'Communication style',
    relationship_goals: 'Relationship goals',
    shared_interests: 'Shared interests',
    location: 'Location',
    age_proximity: 'Age proximity',
    version: 'Algorithm',
  }

  const lines: string[] = []
  for (const [key, value] of Object.entries(breakdown)) {
    if (key === 'version') {
      lines.push(`${labels.version}: ${String(value)}`)
      continue
    }
    if (typeof value === 'number' && value > 0) {
      lines.push(`${labels[key] ?? key}: +${value}`)
    }
  }

  return lines
}

export function deriveEmptyBatchReason(input: {
  rankedCount: number
  poolCandidateCount: number
  topScore: number | null
}): string {
  if (input.poolCandidateCount === 0) {
    return 'No eligible candidates were available in the match pool.'
  }

  if (input.rankedCount === 0) {
    if (input.topScore != null && input.topScore < MIN_COMPATIBILITY_SCORE) {
      return `No candidates met the minimum compatibility score (${MIN_COMPATIBILITY_SCORE}%). Best available score was ${input.topScore}%.`
    }
    return 'All viable candidates were excluded by blocks, prior recommendations, or cooldown rules.'
  }

  return 'No recommendations were selected for this batch.'
}

export function countScorablePoolCandidates(poolSize: number): number {
  return Math.max(0, poolSize - 1)
}
