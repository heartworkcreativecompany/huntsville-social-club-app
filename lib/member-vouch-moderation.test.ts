import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  endorsementEditRequiresRereview,
  isPublicVouchStatus,
  summarizeVouches,
  vouchModerationAllowed,
  VOUCH_DISCLAIMER,
} from '@/lib/member-vouches'

describe('vouch moderation', () => {
  it('hides pending and rejected vouches from the public count', () => {
    const summary = summarizeVouches([
      { vouch_type: 'personal', status: 'pending' },
      { vouch_type: 'professional', status: 'rejected' },
      { vouch_type: 'community', status: 'approved' },
      { vouch_type: 'personal', status: 'approved' },
    ])
    expect(summary.total).toBe(2)
    expect(summary.personal).toBe(1)
    expect(summary.community).toBe(1)
    expect(summary.professional).toBe(0)
    expect(isPublicVouchStatus('pending')).toBe(false)
    expect(isPublicVouchStatus('rejected')).toBe(false)
    expect(isPublicVouchStatus('approved')).toBe(true)
  })

  it('requires re-review when an approved endorsement changes', () => {
    expect(
      endorsementEditRequiresRereview({
        previousStatus: 'approved',
        previousNote: 'Original',
        nextNote: 'Edited',
      })
    ).toBe(true)
    expect(
      endorsementEditRequiresRereview({
        previousStatus: 'approved',
        previousNote: 'Original',
        nextNote: 'Original',
      })
    ).toBe(false)
    expect(
      endorsementEditRequiresRereview({
        previousStatus: 'pending',
        previousNote: null,
        nextNote: 'First draft',
      })
    ).toBe(false)
  })

  it('allows only admins to moderate', () => {
    expect(vouchModerationAllowed('admin')).toBe(true)
    expect(vouchModerationAllowed('member')).toBe(false)
    expect(vouchModerationAllowed('host')).toBe(false)
    expect(vouchModerationAllowed(null)).toBe(false)
    const actions = readFileSync(
      join(__dirname, '../app/(club)/members/vouch-actions.ts'),
      'utf8'
    )
    expect(actions).toContain('vouchModerationAllowed')
    expect(actions).toContain("status: 'pending'")
  })

  it('keeps the community-signal disclaimer and does not auto-approve history', () => {
    expect(VOUCH_DISCLAIMER).toMatch(/not guarantees of safety, compatibility, or conduct/i)
    const migration = readFileSync(
      join(
        __dirname,
        '../supabase/migrations/20261009153100_vouch_review_lifecycle.sql'
      ),
      'utf8'
    )
    expect(migration).toContain("set status = 'pending'")
    expect(migration).toContain("where status in ('active', 'flagged')")
    expect(migration).not.toMatch(/set status = 'approved'/)
    expect(migration).toContain('new.status := \'pending\'')
  })
})
