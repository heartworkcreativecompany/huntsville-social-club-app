import { describe, expect, it } from 'vitest'
import {
  isRemoveMemberEmailConfirmation,
  removeMemberConfirmationLabel,
} from '@/lib/admin/remove-member-confirmation'
import {
  collectMemberPhotoStoragePaths,
  validateRemoveMemberRequest,
} from '@/lib/admin/remove-member-guards'

const memberEmail = 'member@example.com'

describe('isRemoveMemberEmailConfirmation', () => {
  it('rejects the legacy DELETE confirmation text', () => {
    expect(isRemoveMemberEmailConfirmation('DELETE', memberEmail)).toBe(false)
  })

  it('accepts the exact member email', () => {
    expect(isRemoveMemberEmailConfirmation(memberEmail, memberEmail)).toBe(true)
  })

  it('rejects case-mismatched email', () => {
    expect(
      isRemoveMemberEmailConfirmation('Member@Example.com', memberEmail)
    ).toBe(false)
  })

  it('rejects partial email', () => {
    expect(isRemoveMemberEmailConfirmation('member@example', memberEmail)).toBe(
      false
    )
  })

  it('rejects missing member email', () => {
    expect(isRemoveMemberEmailConfirmation(memberEmail, null)).toBe(false)
  })
})

describe('validateRemoveMemberRequest', () => {
  const actorId = 'actor-uuid'
  const targetUserId = 'target-uuid'

  it('requires the exact member email', () => {
    expect(
      validateRemoveMemberRequest({
        actorId,
        targetUserId,
        confirmationText: 'DELETE',
        target: { id: targetUserId, role: 'member', email: memberEmail },
      })
    ).toEqual({
      allowed: false,
      error: removeMemberConfirmationLabel(memberEmail),
    })
  })

  it('rejects missing target profile', () => {
    expect(
      validateRemoveMemberRequest({
        actorId,
        targetUserId,
        confirmationText: memberEmail,
        target: null,
      })
    ).toEqual({ allowed: false, error: 'Member not found.' })
  })

  it('prevents self-delete', () => {
    expect(
      validateRemoveMemberRequest({
        actorId,
        targetUserId: actorId,
        confirmationText: memberEmail,
        target: { id: actorId, role: 'admin', email: memberEmail },
      })
    ).toEqual({
      allowed: false,
      error: 'You cannot remove your own account from this screen.',
    })
  })

  it('prevents deleting admin accounts', () => {
    expect(
      validateRemoveMemberRequest({
        actorId,
        targetUserId,
        confirmationText: memberEmail,
        target: { id: targetUserId, role: 'admin', email: memberEmail },
      })
    ).toEqual({
      allowed: false,
      error: 'Administrator accounts cannot be removed from this action.',
    })
  })

  it('allows valid removal requests', () => {
    expect(
      validateRemoveMemberRequest({
        actorId,
        targetUserId,
        confirmationText: memberEmail,
        target: { id: targetUserId, role: 'member', email: memberEmail },
      })
    ).toEqual({ allowed: true })
  })
})

describe('collectMemberPhotoStoragePaths', () => {
  it('returns unique storage paths from application draft photos', () => {
    const paths = collectMemberPhotoStoragePaths({
      application_draft: {
        version: 2,
        photos: [
          {
            id: 'a',
            storagePath: 'user-1/photo-a.jpg',
            isPrimary: true,
            facePhotoConfirmed: true,
          },
          {
            id: 'b',
            storagePath: 'user-1/photo-a.jpg',
            isPrimary: false,
            facePhotoConfirmed: true,
          },
          {
            id: 'c',
            storagePath: 'user-1/photo-c.webp',
            isPrimary: false,
            facePhotoConfirmed: true,
          },
        ],
      },
    })

    expect(paths).toEqual(['user-1/photo-a.jpg', 'user-1/photo-c.webp'])
  })

  it('returns empty list when draft has no photos', () => {
    expect(
      collectMemberPhotoStoragePaths({
        application_draft: { version: 2, photos: [] },
      })
    ).toEqual([])
  })
})
