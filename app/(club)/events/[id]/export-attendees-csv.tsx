'use client'

import { buttonSecondaryClassName } from '@/lib/event-labels'
import type { AttendeeExportRow } from '@/lib/event-paid-guest-roster'

export type { AttendeeExportRow }

export const ATTENDEE_EXPORT_HEADERS = [
  'Event title',
  'Event date',
  'Type',
  'Attendee name',
  'Attendee email',
  'RSVP status',
  'RSVP answer',
  'Responded at',
] as const

export function buildAttendeeCsv(rows: AttendeeExportRow[]): string {
  const lines = [
    ATTENDEE_EXPORT_HEADERS.map(escapeCsvValue).join(','),
    ...rows.map((row) =>
      [
        row.eventTitle,
        row.eventDate,
        row.attendeeType,
        row.attendeeName,
        row.attendeeEmail,
        row.rsvpStatus,
        row.rsvpAnswer,
        row.respondedAt,
      ]
        .map(escapeCsvValue)
        .join(',')
    ),
  ]
  return lines.join('\n')
}

type ExportAttendeesCsvProps = {
  filename: string
  rows: AttendeeExportRow[]
}

function escapeCsvValue(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export default function ExportAttendeesCsv({
  filename,
  rows,
}: ExportAttendeesCsvProps) {
  const handleExport = () => {
    const csv = buildAttendeeCsv(rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      className={buttonSecondaryClassName}
    >
      Export CSV
    </button>
  )
}
