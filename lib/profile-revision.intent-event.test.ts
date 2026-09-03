import { describe, expect, it } from 'vitest'
import {
  isUsableIntentEventId,
  parseProfilePendingRevision,
} from '@/lib/profile-revision'

const baseRevision = {
  displayName: 'Alex',
  bio: 'Hello',
  locationArea: 'Downtown',
  memberPublicIntents: ['dating'] as const,
  submittedAt: '2026-09-03T12:00:00.000Z',
}

describe('isUsableIntentEventId', () => {
  it('accepts a non-empty UUID string', () => {
    expect(isUsableIntentEventId('11111111-1111-4111-8111-111111111111')).toBe(
      true
    )
  })

  it('rejects missing, blank, and non-string values', () => {
    expect(isUsableIntentEventId(undefined)).toBe(false)
    expect(isUsableIntentEventId(null)).toBe(false)
    expect(isUsableIntentEventId('')).toBe(false)
    expect(isUsableIntentEventId('   ')).toBe(false)
    expect(isUsableIntentEventId(12)).toBe(false)
  })
})

describe('parseProfilePendingRevision — intentEventId', () => {
  it('preserves a submitted intentEventId', () => {
    const parsed = parseProfilePendingRevision({
      ...baseRevision,
      intentEventId: '11111111-1111-4111-8111-111111111111',
    })
    expect(parsed?.intentEventId).toBe(
      '11111111-1111-4111-8111-111111111111'
    )
  })

  it('treats a legacy object without intentEventId as valid', () => {
    const parsed = parseProfilePendingRevision(baseRevision)
    expect(parsed).not.toBeNull()
    expect(parsed?.intentEventId).toBeUndefined()
    expect(parsed?.displayName).toBe('Alex')
    expect(parsed?.memberPublicIntents).toEqual(['dating'])
  })

  it('omits a blank intentEventId instead of minting one', () => {
    const parsed = parseProfilePendingRevision({
      ...baseRevision,
      intentEventId: '   ',
    })
    expect(parsed?.intentEventId).toBeUndefined()
  })
})
