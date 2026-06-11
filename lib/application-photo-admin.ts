import { createMemberPhotoSignedUrl } from '@/lib/member-photo-access'

export type AdminPhotoSignedUrlResult = {
  url: string | null
  error?: string
}

/** @deprecated Use createMemberPhotoSignedUrl — kept for admin imports */
export async function createAdminApplicationPhotoSignedUrl(
  applicantId: string,
  storagePath: string
): Promise<AdminPhotoSignedUrlResult> {
  return createMemberPhotoSignedUrl(applicantId, storagePath)
}

export async function createAdminApplicationPhotoSignedUrls(
  applicantId: string,
  storagePaths: string[]
): Promise<Record<string, AdminPhotoSignedUrlResult>> {
  const results = await Promise.all(
    storagePaths.map(async (storagePath) => {
      const result = await createMemberPhotoSignedUrl(applicantId, storagePath)
      return [storagePath, result] as const
    })
  )
  return Object.fromEntries(results)
}
