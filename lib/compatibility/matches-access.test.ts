import { describe, expect, it } from 'vitest'
import { canAccessMatchesInbox } from '@/lib/compatibility/matches-access'
import type { CompatibilityProfileStatus } from '@/lib/compatibility/profile-status'

describe('canAccessMatchesInbox', () => {
  it('allows inbox only when summary status is active', () => {
    const statuses: CompatibilityProfileStatus[] = [
      'disabled',
      'not_approved',
      'no_dating',
      'no_messaging',
      'paused',
      'paused_system',
      'questionnaire_needed',
      'questionnaire_in_progress',
    ]

    for (const status of statuses) {
      expect(canAccessMatchesInbox({ status })).toBe(false)
    }

    expect(canAccessMatchesInbox({ status: 'active' })).toBe(true)
  })
})
