'use server'

import {
  canViewMemberPhotos,
  createMemberPhotoSignedUrl,
} from '@/lib/member-photo-access'

export async function getMemberPhotoSignedUrl(
  memberId: string,
  storagePath: string
) {
  return createMemberPhotoSignedUrl(memberId, storagePath)
}

export async function getMemberPhotoSignedUrls(
  memberId: string,
  storagePaths: string[]
) {
  const access = await canViewMemberPhotos(memberId)
  if (!access.allowed) {
    return {
      urls: Object.fromEntries(
        storagePaths.map((path) => [
          path,
          { url: null, error: access.reason ?? 'Unauthorized', unauthorized: true },
        ])
      ),
    }
  }

  const entries = await Promise.all(
    storagePaths.map(async (storagePath) => {
      const result = await createMemberPhotoSignedUrl(memberId, storagePath)
      return [storagePath, result] as const
    })
  )

  return { urls: Object.fromEntries(entries) }
}
