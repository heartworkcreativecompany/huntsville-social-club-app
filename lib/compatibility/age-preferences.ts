/** Dating-profile age and preferred match range. Not public directory metadata. */

export const MIN_DATING_AGE = 18
export const MAX_DATING_AGE = 99

export const PREFERRED_MATCH_AGE_RANGE_LAYOUT_CLASS =
  'grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2'

export type DatingAgePreferences = {
  age: number
  preferredMatchAgeMin: number
  preferredMatchAgeMax: number
}

export type DatingAgePreferenceColumns = {
  age: number | null
  preferred_match_age_min: number | null
  preferred_match_age_max: number | null
}

export type DatingAgeFieldErrors = {
  age?: string
  preferredMatchAgeMin?: string
  preferredMatchAgeMax?: string
  preferredMatchAgeRange?: string
}

const WHOLE_NUMBER_PATTERN = /^-?\d+$/

export function parseAdultAge(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      return null
    }
    if (value < MIN_DATING_AGE || value > MAX_DATING_AGE) {
      return null
    }
    return value
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!WHOLE_NUMBER_PATTERN.test(trimmed)) {
      return null
    }
    return parseAdultAge(Number(trimmed))
  }

  return null
}

export function parseIntegerAgeInput(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') {
    return null
  }
  if (!WHOLE_NUMBER_PATTERN.test(trimmed)) {
    return null
  }
  const parsed = Number(trimmed)
  return Number.isInteger(parsed) ? parsed : null
}

export function parseDatingAgePreferences(
  value: {
    age?: unknown
    preferredMatchAgeMin?: unknown
    preferredMatchAgeMax?: unknown
  } | null | undefined
): DatingAgePreferences | null {
  if (!value) {
    return null
  }

  const age = parseAdultAge(value.age)
  const preferredMatchAgeMin = parseAdultAge(value.preferredMatchAgeMin)
  const preferredMatchAgeMax = parseAdultAge(value.preferredMatchAgeMax)

  if (
    age === null ||
    preferredMatchAgeMin === null ||
    preferredMatchAgeMax === null
  ) {
    return null
  }

  if (preferredMatchAgeMin > preferredMatchAgeMax) {
    return null
  }

  return { age, preferredMatchAgeMin, preferredMatchAgeMax }
}

export function hasCompleteDatingAgePreferences(
  value: {
    age?: unknown
    preferredMatchAgeMin?: unknown
    preferredMatchAgeMax?: unknown
  } | null | undefined
): boolean {
  return parseDatingAgePreferences(value) != null
}

export function datingAgePreferenceColumnPatch(
  value: {
    age?: unknown
    preferredMatchAgeMin?: unknown
    preferredMatchAgeMax?: unknown
  } | null | undefined
): DatingAgePreferenceColumns {
  const parsed = parseDatingAgePreferences(value)
  if (!parsed) {
    return {
      age: null,
      preferred_match_age_min: null,
      preferred_match_age_max: null,
    }
  }

  return {
    age: parsed.age,
    preferred_match_age_min: parsed.preferredMatchAgeMin,
    preferred_match_age_max: parsed.preferredMatchAgeMax,
  }
}

export function isMutualDatingAgeMatch(
  left: {
    age?: unknown
    preferredMatchAgeMin?: unknown
    preferredMatchAgeMax?: unknown
  } | null | undefined,
  right: {
    age?: unknown
    preferredMatchAgeMin?: unknown
    preferredMatchAgeMax?: unknown
  } | null | undefined
): boolean {
  const viewer = parseDatingAgePreferences(left)
  const candidate = parseDatingAgePreferences(right)

  if (!viewer || !candidate) {
    return false
  }

  const candidateFitsViewer =
    candidate.age >= viewer.preferredMatchAgeMin &&
    candidate.age <= viewer.preferredMatchAgeMax
  const viewerFitsCandidate =
    viewer.age >= candidate.preferredMatchAgeMin &&
    viewer.age <= candidate.preferredMatchAgeMax

  return candidateFitsViewer && viewerFitsCandidate
}

export function datingAgeFieldErrors(answers: {
  age: number | null
  preferredMatchAgeMin: number | null
  preferredMatchAgeMax: number | null
}): DatingAgeFieldErrors {
  const errors: DatingAgeFieldErrors = {}

  if (answers.age != null && parseAdultAge(answers.age) === null) {
    errors.age = 'Enter a whole number between 18 and 99.'
  }

  if (
    answers.preferredMatchAgeMin != null &&
    parseAdultAge(answers.preferredMatchAgeMin) === null
  ) {
    errors.preferredMatchAgeMin =
      'Minimum age must be a whole number between 18 and 99.'
  }

  if (
    answers.preferredMatchAgeMax != null &&
    parseAdultAge(answers.preferredMatchAgeMax) === null
  ) {
    errors.preferredMatchAgeMax =
      'Maximum age must be a whole number between 18 and 99.'
  }

  const min = parseAdultAge(answers.preferredMatchAgeMin)
  const max = parseAdultAge(answers.preferredMatchAgeMax)
  if (min != null && max != null && min > max) {
    errors.preferredMatchAgeRange =
      'Minimum age cannot be higher than maximum age.'
  }

  return errors
}

export function hasBlockingDatingAgeFieldErrors(answers: {
  age: number | null
  preferredMatchAgeMin: number | null
  preferredMatchAgeMax: number | null
}): boolean {
  return Object.keys(datingAgeFieldErrors(answers)).length > 0
}

export function preferredMatchAgeRangeSummary(
  min: number | null,
  max: number | null
): string | null {
  const parsedMin = parseAdultAge(min)
  const parsedMax = parseAdultAge(max)
  if (parsedMin == null || parsedMax == null || parsedMin > parsedMax) {
    return null
  }

  return `I’m open to matches ages ${parsedMin} to ${parsedMax}.`
}

export function ownProfileCompatibilityWriteFilter(sessionUserId: string): {
  column: 'id'
  value: string
} {
  if (!sessionUserId.trim()) {
    throw new Error('A signed-in user is required to update dating preferences.')
  }

  return { column: 'id', value: sessionUserId }
}

export function directorySelectExcludesDatingAgePreferences(
  selectList: string
): boolean {
  const fields = selectList.split(',').map((field) => field.trim())
  return (
    !fields.includes('age') &&
    !fields.includes('preferred_match_age_min') &&
    !fields.includes('preferred_match_age_max')
  )
}
