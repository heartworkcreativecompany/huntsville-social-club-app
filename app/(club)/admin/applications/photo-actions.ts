'use server'

import {
  createAdminApplicationPhotoSignedUrl,
  createAdminApplicationPhotoSignedUrls,
} from '@/lib/application-photo-admin'

export async function getAdminApplicationPhotoSignedUrl(
  applicantId: string,
  storagePath: string
) {
  return createAdminApplicationPhotoSignedUrl(applicantId, storagePath)
}

export async function getAdminApplicationPhotoSignedUrls(
  applicantId: string,
  storagePaths: string[]
) {
  return createAdminApplicationPhotoSignedUrls(applicantId, storagePaths)
}
