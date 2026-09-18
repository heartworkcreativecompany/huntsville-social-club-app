/**
 * Read-only event-time diagnostic for fixture JSON only.
 *
 * Do not point this at production. It never opens a database connection.
 *
 * Usage:
 *   npx tsx scripts/diagnose-event-times.ts path/to/events-fixture.json
 *
 * Fixture shape:
 *   [{ "id": "...", "title": "...", "starts_at": "...", "ends_at": null }]
 */

import { readFileSync } from 'node:fs'
import { diagnoseStoredEventTimes } from '../lib/event-time-diagnostics'

function main() {
  const fixturePath = process.argv[2]
  if (!fixturePath) {
    console.error(
      'Usage: npx tsx scripts/diagnose-event-times.ts <fixture.json>\nThis tool is read-only and does not connect to production.'
    )
    process.exit(1)
  }

  const rows = JSON.parse(readFileSync(fixturePath, 'utf8'))
  if (!Array.isArray(rows)) {
    console.error('Fixture must be an array of event rows.')
    process.exit(1)
  }

  console.log(JSON.stringify(diagnoseStoredEventTimes(rows), null, 2))
}

main()
