import { describe, expect, it } from 'vitest'
import {
  curatedMatchDisplayLabel,
  curatedMatchDisplayState,
  curatedMatchLifecycle,
} from '@/lib/curated-match-lifecycle'

describe('curatedMatchDisplayState', () => {
  it('maps recommendation and intro states to member-facing labels', () => {
    expect(
      curatedMatchDisplayState({
        introStatus: 'none',
        recommendationStatus: 'pending',
      })
    ).toBe('new')

    expect(
      curatedMatchDisplayState({
        introStatus: 'none',
        recommendationStatus: 'viewed',
      })
    ).toBe('viewed')

    expect(
      curatedMatchDisplayState({
        introStatus: 'pending',
        recommendationStatus: 'viewed',
      })
    ).toBe('intro_requested')

    expect(
      curatedMatchDisplayState({
        introStatus: 'matched',
        recommendationStatus: 'accepted',
      })
    ).toBe('connected')

    expect(
      curatedMatchDisplayState({
        introStatus: 'none',
        recommendationStatus: 'passed',
      })
    ).toBe('passed')

    expect(
      curatedMatchDisplayState({
        introStatus: 'declined',
        recommendationStatus: 'declined',
      })
    ).toBe('declined')

    expect(
      curatedMatchDisplayState({
        introStatus: 'declined',
        recommendationStatus: 'viewed',
      })
    ).toBe('declined')

    expect(
      curatedMatchDisplayState({
        introStatus: 'none',
        recommendationStatus: 'expired',
      })
    ).toBe('expired')
  })

  it('labels display states for UI', () => {
    expect(curatedMatchDisplayLabel('new')).toBe('New')
    expect(curatedMatchDisplayLabel('intro_requested')).toBe('Request sent')
    expect(curatedMatchDisplayLabel('connected')).toBe('Connected')
    expect(curatedMatchDisplayLabel('passed')).toBe('Passed')
    expect(curatedMatchDisplayLabel('declined')).toBe('Not available')
    expect(curatedMatchDisplayLabel('expired')).toBe('Expired')
  })
})

describe('curatedMatchLifecycle', () => {
  it('keeps legacy lifecycle mapping for admin flows', () => {
    expect(
      curatedMatchLifecycle({
        introStatus: 'none',
        recommendationStatus: 'pending',
      })
    ).toBe('available')

    expect(
      curatedMatchLifecycle({
        introStatus: 'matched',
        recommendationStatus: 'accepted',
      })
    ).toBe('matched')
  })
})
