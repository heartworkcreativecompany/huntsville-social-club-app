import { describe, expect, it } from 'vitest'
import type { ApplicationPhoto } from '@/lib/application'
import {
  pendingOnlyStoragePaths,
  replacedLiveStoragePaths,
  supersededPendingStoragePaths,
} from '@/lib/profile-photo-references'

function photo(id: string, path: string): ApplicationPhoto {
  return {
    id,
    storagePath: path,
    isPrimary: false,
    facePhotoConfirmed: false,
  }
}

describe('profile photo reference helpers', () => {
  it('identifies pending-only uploads for reject cleanup', () => {
    const live = [photo('1', 'user/a.jpg')]
    const pending = [photo('1', 'user/a.jpg'), photo('2', 'user/b.jpg')]

    expect(pendingOnlyStoragePaths(live, pending)).toEqual(['user/b.jpg'])
  })

  it('identifies replaced live photos for approve cleanup', () => {
    const live = [photo('1', 'user/a.jpg'), photo('2', 'user/b.jpg')]
    const next = [photo('3', 'user/c.jpg'), photo('2', 'user/b.jpg')]

    expect(replacedLiveStoragePaths(live, next)).toEqual(['user/a.jpg'])
  })

  it('identifies superseded pending-only uploads on resubmit', () => {
    const live = [photo('1', 'user/a.jpg')]
    const previousPending = [photo('1', 'user/a.jpg'), photo('2', 'user/b.jpg')]
    const nextPending = [photo('1', 'user/a.jpg'), photo('3', 'user/c.jpg')]

    expect(
      supersededPendingStoragePaths({
        livePhotos: live,
        previousPendingPhotos: previousPending,
        nextPendingPhotos: nextPending,
      })
    ).toEqual(['user/b.jpg'])
  })
})
