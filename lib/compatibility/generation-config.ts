export const RECOMMENDATIONS_PER_BATCH = 3
export const MIN_COMPATIBILITY_SCORE = 70
export const SCORE_ALGORITHM_VERSION = 'v2_questionnaire'
export const GENERATION_INTERVAL_DAYS = 7

export function generationIntervalDays(): number {
  const raw = process.env.CURATED_MATCH_GENERATION_INTERVAL_DAYS
  if (!raw) {
    return GENERATION_INTERVAL_DAYS
  }
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : GENERATION_INTERVAL_DAYS
}
