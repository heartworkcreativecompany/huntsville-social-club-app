/** Membership-application age eligibility from the stored date-of-birth string. */

export const MEMBERSHIP_MINIMUM_AGE = 18

export type CalendarDate = {
  year: number
  month: number
  day: number
}

export type AgeEligibilityFailureCode =
  | 'missing'
  | 'invalid'
  | 'future'
  | 'underage'

export type AgeEligibilityOutcome =
  | { ok: true; age: number }
  | { ok: false; code: AgeEligibilityFailureCode }

const ISO_DATE_ONLY = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Parse the app's stored DOB (`YYYY-MM-DD`) as a calendar date, not a timestamp. */
export function parseIsoDateOnly(value: string): CalendarDate | null {
  const trimmed = value.trim()
  const match = ISO_DATE_ONLY.exec(trimmed)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (day > daysInMonth(year, month)) return null

  return { year, month, day }
}

export function calendarDateFromInstant(now: Date): CalendarDate {
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  }
}

export function compareCalendarDates(
  left: CalendarDate,
  right: CalendarDate
): number {
  if (left.year !== right.year) return left.year - right.year
  if (left.month !== right.month) return left.month - right.month
  return left.day - right.day
}

/** Whole years of age on `today`, before the birthday has occurred this year. */
export function ageOnCalendarDate(
  dateOfBirth: CalendarDate,
  today: CalendarDate
): number {
  let age = today.year - dateOfBirth.year
  if (
    today.month < dateOfBirth.month ||
    (today.month === dateOfBirth.month && today.day < dateOfBirth.day)
  ) {
    age -= 1
  }
  return age
}

/**
 * Decide 18+ membership eligibility from the stored DOB string.
 * Pass `now` in tests. Never logs or interpolates the date of birth.
 */
export function evaluateMembershipAgeEligibility(
  dateOfBirth: string,
  now: Date = new Date()
): AgeEligibilityOutcome {
  const trimmed = dateOfBirth.trim()
  if (!trimmed) {
    return { ok: false, code: 'missing' }
  }

  const dob = parseIsoDateOnly(trimmed)
  if (!dob) {
    return { ok: false, code: 'invalid' }
  }

  const today = calendarDateFromInstant(now)
  if (compareCalendarDates(dob, today) > 0) {
    return { ok: false, code: 'future' }
  }

  const age = ageOnCalendarDate(dob, today)
  if (age < MEMBERSHIP_MINIMUM_AGE) {
    return { ok: false, code: 'underage' }
  }

  return { ok: true, age }
}
