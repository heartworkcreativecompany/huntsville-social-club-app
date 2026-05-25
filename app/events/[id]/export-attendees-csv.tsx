'use client'

export type AttendeeExportRow = {
  eventTitle: string
  eventDate: string
  attendeeName: string
  attendeeEmail: string
  rsvpStatus: string
  respondedAt: string
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
    const headers = [
      'Event title',
      'Event date',
      'Attendee name',
      'Attendee email',
      'RSVP status',
      'Responded at',
    ]

    const lines = [
      headers.map(escapeCsvValue).join(','),
      ...rows.map((row) =>
        [
          row.eventTitle,
          row.eventDate,
          row.attendeeName,
          row.attendeeEmail,
          row.rsvpStatus,
          row.respondedAt,
        ]
          .map(escapeCsvValue)
          .join(',')
      ),
    ]

    const csv = lines.join('\n')
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
      onClick={handleExport}
      style={{
        padding: '8px 12px',
        borderRadius: '8px',
        border: '1px solid #ccc',
        cursor: 'pointer',
        background: 'transparent',
      }}
    >
      Export CSV
    </button>
  )
}
