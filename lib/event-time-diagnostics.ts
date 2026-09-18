import {
  chicagoDateAndTimeFromIso,
  formatEventDateInChicago,
  toChicagoDatetimeLocalValue,
} from '@/lib/event-time'

/**
 * Read-only SQL for later ops review. Do not run automatically against production.
 *
 * SELECT id, title, starts_at, ends_at
 * FROM events
 * ORDER BY starts_at;
 */
export const EVENT_TIME_DIAGNOSTIC_QUERY = `
SELECT id, title, starts_at, ends_at
FROM events
ORDER BY starts_at
`.trim()

export type StoredEventTimeRow = {
  id: string
  title: string
  starts_at: string
  ends_at: string | null
}

export type EventTimeDiagnosis = {
  id: string
  title: string
  rawStartsAt: string
  rawEndsAt: string | null
  chicagoStartsAt: string | null
  chicagoEndsAt: string | null
  editorPrefillStart: string
  editorPrefillEnd: string
  displayPath: 'formatEventDateInChicago (America/Chicago)'
}

export function diagnoseStoredEventTimes(
  rows: StoredEventTimeRow[]
): EventTimeDiagnosis[] {
  return rows.map((row) => {
    const startParts = chicagoDateAndTimeFromIso(row.starts_at)
    const endParts = row.ends_at ? chicagoDateAndTimeFromIso(row.ends_at) : null

    return {
      id: row.id,
      title: row.title,
      rawStartsAt: row.starts_at,
      rawEndsAt: row.ends_at,
      chicagoStartsAt: startParts
        ? formatEventDateInChicago(row.starts_at)
        : null,
      chicagoEndsAt:
        row.ends_at && endParts ? formatEventDateInChicago(row.ends_at) : null,
      editorPrefillStart: toChicagoDatetimeLocalValue(row.starts_at),
      editorPrefillEnd: toChicagoDatetimeLocalValue(row.ends_at),
      displayPath: 'formatEventDateInChicago (America/Chicago)',
    }
  })
}
