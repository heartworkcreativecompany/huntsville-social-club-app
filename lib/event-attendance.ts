export const EVENT_AT_CAPACITY_MESSAGE = 'This event is at capacity.'

/** Parse optional Attendance Max form value. Empty → unlimited (null). */
export function parseAttendanceMax(
  raw: string | number | null | undefined
): { value: number | null } | { error: string } {
  if (raw == null) return { value: null }

  const trimmed = String(raw).trim()
  if (!trimmed) return { value: null }

  if (!/^\d+$/.test(trimmed)) {
    return {
      error: 'Attendance Max must be a positive whole number.',
    }
  }

  const parsed = Number.parseInt(trimmed, 10)
  if (!Number.isFinite(parsed) || parsed < 1) {
    return {
      error: 'Attendance Max must be a positive whole number.',
    }
  }

  return { value: parsed }
}

export function isEventAtCapacity(
  goingCount: number,
  attendanceMax: number | null | undefined
): boolean {
  if (attendanceMax == null || attendanceMax <= 0) return false
  return goingCount >= attendanceMax
}

export function formatAttendanceMaxLabel(
  attendanceMax: number | null | undefined
): string | null {
  if (attendanceMax == null || attendanceMax <= 0) return null
  return `Max ${attendanceMax} attending`
}
