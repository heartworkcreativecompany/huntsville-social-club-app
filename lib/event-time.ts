/**
 * Canonical event-local timezone for Huntsville Social Club.
 *
 * Admin datetime-local values are wall-clock times in America/Chicago.
 * Stored timestamps are UTC instants (timestamptz). Display always uses
 * America/Chicago so cards/details do not follow the viewer or server TZ.
 *
 * DST policy:
 * - Spring-forward gap (nonexistent local times, e.g. 2:30 AM on the
 *   second Sunday in March): rejected. Ask the admin to pick a valid time.
 * - Fall-back overlap (ambiguous local times, e.g. 1:30 AM on the first
 *   Sunday in November): the earlier occurrence is used (still CDT, UTC−5).
 */

export const EVENT_TIME_ZONE = 'America/Chicago' as const

const DATETIME_LOCAL_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/

const INSTANT_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/i

export class EventTimeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EventTimeError'
  }
}

export type ChicagoWallClock = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

export type ChicagoDateAndTime = {
  date: string
  time: string
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0')
}

function readPart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes
): string {
  const match = parts.find((part) => part.type === type)
  if (!match) {
    throw new EventTimeError('Could not format event time in Central Time.')
  }
  return match.value
}

function getZonedParts(instant: Date, timeZone: string): ChicagoWallClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant)

  return {
    year: Number(readPart(parts, 'year')),
    month: Number(readPart(parts, 'month')),
    day: Number(readPart(parts, 'day')),
    hour: Number(readPart(parts, 'hour')),
    minute: Number(readPart(parts, 'minute')),
    second: Number(readPart(parts, 'second')),
  }
}

function wallClockUtcMs(wall: ChicagoWallClock): number {
  return Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second
  )
}

function sameWallClock(left: ChicagoWallClock, right: ChicagoWallClock): boolean {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute &&
    left.second === right.second
  )
}

function parseWallClock(raw: string): ChicagoWallClock | null {
  const match = DATETIME_LOCAL_RE.exec(raw.trim())
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6] ?? 0)

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null
  }

  return { year, month, day, hour, minute, second }
}

/**
 * Convert an America/Chicago wall-clock time to a UTC Date.
 */
export function chicagoWallTimeToUtcDate(wall: ChicagoWallClock): Date {
  const guess = wallClockUtcMs(wall)
  const candidates: number[] = []

  // Try plausible UTC offsets and keep instants that Intl confirms in
  // America/Chicago. This handles CST (UTC−6) and CDT (UTC−5) without
  // hard-coding a single offset.
  for (let offsetHours = -12; offsetHours <= 14; offsetHours += 1) {
    const instant = guess - offsetHours * 3_600_000
    const verified = getZonedParts(new Date(instant), EVENT_TIME_ZONE)
    if (sameWallClock(verified, wall) && !candidates.includes(instant)) {
      candidates.push(instant)
    }
  }

  if (candidates.length === 0) {
    throw new EventTimeError(
      'That date and time does not exist in Central Time because of daylight saving. Choose another time.'
    )
  }

  candidates.sort((a, b) => a - b)
  return new Date(candidates[0])
}

export function parseStoredEventInstant(iso: string): Date | null {
  const trimmed = iso.trim()
  if (!trimmed) return null
  const date = new Date(trimmed)
  return Number.isNaN(date.getTime()) ? null : date
}

export function chicagoDateAndTimeFromIso(iso: string): ChicagoDateAndTime | null {
  const instant = parseStoredEventInstant(iso)
  if (!instant) return null

  const wall = getZonedParts(instant, EVENT_TIME_ZONE)
  return {
    date: `${wall.year}-${pad(wall.month)}-${pad(wall.day)}`,
    time: `${pad(wall.hour)}:${pad(wall.minute)}`,
  }
}

/** Prefill a datetime-local input from a stored UTC instant. */
export function toChicagoDatetimeLocalValue(
  iso: string | null | undefined
): string {
  if (!iso) return ''
  const parts = chicagoDateAndTimeFromIso(iso)
  if (!parts) return ''
  return `${parts.date}T${parts.time}`
}

/**
 * Parse a datetime-local (or already-zoned ISO) value as America/Chicago
 * wall time and return a UTC ISO instant.
 */
export function parseChicagoDatetimeLocalToIso(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  if (INSTANT_RE.test(trimmed)) {
    const instant = parseStoredEventInstant(trimmed)
    if (!instant) {
      throw new EventTimeError('Enter a valid date and time.')
    }
    return instant.toISOString()
  }

  const wall = parseWallClock(trimmed)
  if (!wall) {
    throw new EventTimeError('Enter a valid date and time.')
  }

  return chicagoWallTimeToUtcDate(wall).toISOString()
}

function formatChicagoDateTime(
  iso: string,
  options: Intl.DateTimeFormatOptions
): string {
  const instant = parseStoredEventInstant(iso)
  if (!instant) return ''

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT_TIME_ZONE,
    ...options,
  }).formatToParts(instant)

  const weekday = readPart(parts, 'weekday')
  const month = readPart(parts, 'month')
  const day = readPart(parts, 'day')
  const hour = readPart(parts, 'hour')
  const minute = readPart(parts, 'minute')
  const dayPeriod = readPart(parts, 'dayPeriod')

  return `${weekday}, ${month} ${day}, ${hour}:${minute} ${dayPeriod}`
}

/** Member-facing event cards, lists, and details. Example: Sun, Oct 4, 5:00 PM */
export function formatEventDateInChicago(iso: string): string {
  return formatChicagoDateTime(iso, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

/** Same Chicago clock as cards; used for RSVP-window copy. */
export function formatEventTimestampInChicago(
  iso: string | null | undefined
): string | null {
  if (!iso?.trim()) return null
  const formatted = formatEventDateInChicago(iso)
  return formatted || null
}
