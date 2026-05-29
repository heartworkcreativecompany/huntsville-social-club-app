import { createClient } from '@/lib/supabase/server'
import { APPLICATION_PHOTOS_BUCKET } from '@/lib/application-photo-storage'
import { getViewer } from '@/lib/viewer'

const SIGNED_URL_TTL_SECONDS = 3600

export type AdminPhotoSignedUrlResult = {
  url: string | null
  error?: string
}

async function assertAdmin() {
  const viewer = await getViewer()
  if (!viewer || viewer.role !== 'admin') {
    return null
  }
  return viewer
}

function assertApplicantPhotoPath(applicantId: string, storagePath: string): boolean {
  return storagePath.startsWith(`${applicantId}/`) && !storagePath.includes('..')
}

export async function createAdminApplicationPhotoSignedUrl(
  applicantId: string,
  storagePath: string
): Promise<AdminPhotoSignedUrlResult> {
  const admin = await assertAdmin()
  if (!admin) {
    return { url: null, error: 'Unauthorized' }
  }

  if (!assertApplicantPhotoPath(applicantId, storagePath)) {
    return { url: null, error: 'Invalid photo path' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.storage
    .from(APPLICATION_PHOTOS_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS)

  if (error) {
    const message = error.message.toLowerCase()
    if (message.includes('not found') || message.includes('object not found')) {
      return { url: null, error: 'Photo file not found in storage' }
    }
    return { url: null, error: error.message }
  }

  if (!data?.signedUrl) {
    return { url: null, error: 'Could not create preview URL' }
  }

  return { url: data.signedUrl }
}

export async function createAdminApplicationPhotoSignedUrls(
  applicantId: string,
  storagePaths: string[]
): Promise<Record<string, AdminPhotoSignedUrlResult>> {
  const admin = await assertAdmin()
  if (!admin) {
    return Object.fromEntries(
      storagePaths.map((path) => [path, { url: null, error: 'Unauthorized' }])
    )
  }

  const results = await Promise.all(
    storagePaths.map(async (storagePath) => {
      const result = await createAdminApplicationPhotoSignedUrl(
        applicantId,
        storagePath
      )
      return [storagePath, result] as const
    })
  )

  return Object.fromEntries(results)
}
