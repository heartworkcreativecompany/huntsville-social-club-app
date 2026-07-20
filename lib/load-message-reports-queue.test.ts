import { describe, expect, it } from 'vitest'
import { parseFocusReportId } from '@/lib/load-message-reports-queue'

describe('parseFocusReportId', () => {
  it('accepts valid UUIDs', () => {
    expect(parseFocusReportId('a1b2c3d4-e5f6-4789-a012-3456789abcde')).toBe(
      'a1b2c3d4-e5f6-4789-a012-3456789abcde'
    )
  })

  it('trims whitespace', () => {
    expect(parseFocusReportId('  a1b2c3d4-e5f6-4789-a012-3456789abcde  ')).toBe(
      'a1b2c3d4-e5f6-4789-a012-3456789abcde'
    )
  })

  it('rejects invalid values', () => {
    expect(parseFocusReportId(undefined)).toBeNull()
    expect(parseFocusReportId('')).toBeNull()
    expect(parseFocusReportId('not-a-uuid')).toBeNull()
  })
})
