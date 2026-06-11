import { createClient } from '@/lib/supabase/client'
import type { ApplicationPhoto } from '@/lib/application'
import { PHOTO_MAX_COUNT } from '@/lib/application-form-content'

export const APPLICATION_PHOTOS_BUCKET = 'application-photos'

export const PHOTO_MAX_BYTES = 5 * 1024 * 1024

export const PHOTO_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
] as const

type StorageLikeError = {
  message?: string
  statusCode?: string | number
  error?: string
}

function extensionForMime(type: string): string {
  if (type === 'image/png') return 'png'
  if (type === 'image/webp') return 'webp'
  return 'jpg'
}

function normalizeStorageError(error: StorageLikeError): {
  message: string
  statusCode?: string | number
} {
  return {
    message: error.message ?? error.error ?? 'Unknown storage error',
    statusCode: error.statusCode,
  }
}

/** Map Supabase Storage errors to actionable UI copy. */
export function storageErrorMessage(error: StorageLikeError): string {
  const { message, statusCode } = normalizeStorageError(error)
  const lower = message.toLowerCase()
  const code = String(statusCode ?? '')

  if (
    code === '404' ||
    lower.includes('bucket not found') ||
    lower.includes('bucket does not exist')
  ) {
    return `Photo storage bucket "${APPLICATION_PHOTOS_BUCKET}" is missing on this Supabase project. Apply migrations with: npx supabase db push`
  }

  if (
    code === '401' ||
    lower.includes('jwt') ||
    lower.includes('not authenticated') ||
    lower.includes('invalid claim')
  ) {
    return 'Your session expired. Sign out, sign back in, and try uploading again.'
  }

  if (
    code === '403' ||
    lower.includes('row-level security') ||
    lower.includes('policy') ||
    lower.includes('unauthorized') ||
    lower.includes('not allowed')
  ) {
    return 'Upload was blocked by storage permissions. Sign out and back in. If this continues, run npx supabase db push to apply storage policies.'
  }

  if (
    lower.includes('invalid api key') ||
    lower.includes('apikey') ||
    lower.includes('invalid jwt') ||
    (lower.includes('project') && lower.includes('not found'))
  ) {
    return 'This app is not connected to the correct Supabase project. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.'
  }

  if (
    lower.includes('mime') ||
    lower.includes('content type') ||
    lower.includes('invalid file type')
  ) {
    return 'That file type is not allowed. Use JPEG, PNG, or WebP.'
  }

  if (lower.includes('payload too large') || lower.includes('entity too large')) {
    return 'That file is too large. Please choose a photo under 5 MB.'
  }

  if (lower.includes('already exists')) {
    return 'That photo path already exists. Remove the photo and try again.'
  }

  return message
}

async function assertApplicationPhotosBucketReady(
  supabase: ReturnType<typeof createClient>
): Promise<{ error?: string }> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return {
      error:
        'Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.',
    }
  }

  const { error } = await supabase.storage.getBucket(APPLICATION_PHOTOS_BUCKET)

  if (error) {
    return { error: storageErrorMessage(error) }
  }

  return {}
}

/** Client-side validation before upload (keeps files off Server Actions). */
export function validateApplicationPhotoFile(
  file: File,
  currentPhotoCount: number
): string | null {
  if (currentPhotoCount >= PHOTO_MAX_COUNT) {
    return `You can upload up to ${PHOTO_MAX_COUNT} photos.`
  }

  if (file.size === 0) {
    return 'Please choose a valid photo file.'
  }

  if (
    !PHOTO_ALLOWED_MIME_TYPES.includes(
      file.type as (typeof PHOTO_ALLOWED_MIME_TYPES)[number]
    )
  ) {
    return 'Photos must be JPEG, PNG, or WebP.'
  }

  if (file.size > PHOTO_MAX_BYTES) {
    return 'Each photo must be 5 MB or smaller.'
  }

  return null
}

export async function uploadApplicationPhotoToStorage(
  file: File,
  currentPhotoCount: number
): Promise<{ photo?: ApplicationPhoto; error?: string }> {
  const validationError = validateApplicationPhotoFile(file, currentPhotoCount)
  if (validationError) {
    return { error: validationError }
  }

  const supabase = createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { error: 'You must be signed in to upload photos.' }
  }

  const bucketCheck = await assertApplicationPhotosBucketReady(supabase)
  if (bucketCheck.error) {
    return { error: bucketCheck.error }
  }

  const photoId = crypto.randomUUID()
  const storagePath = `${user.id}/${photoId}.${extensionForMime(file.type)}`
  const contentType =
    file.type && PHOTO_ALLOWED_MIME_TYPES.includes(
      file.type as (typeof PHOTO_ALLOWED_MIME_TYPES)[number]
    )
      ? file.type
      : 'image/jpeg'

  const { error } = await supabase.storage
    .from(APPLICATION_PHOTOS_BUCKET)
    .upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType,
    })

  if (error) {
    const { captureOperationalError } = await import('@/lib/capture-error')
    captureOperationalError('photo_upload', error, {
      status: error.statusCode ?? 0,
    })
    return { error: storageErrorMessage(error) }
  }

  return {
    photo: {
      id: photoId,
      storagePath,
      isPrimary: false,
      facePhotoConfirmed: false,
    },
  }
}

export async function deleteApplicationPhotoFromStorage(
  storagePath: string
): Promise<{ error?: string }> {
  const supabase = createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { error: 'You must be signed in.' }
  }

  if (!storagePath.startsWith(`${user.id}/`)) {
    return { error: 'Invalid photo path.' }
  }

  const { error } = await supabase.storage
    .from(APPLICATION_PHOTOS_BUCKET)
    .remove([storagePath])

  if (error) {
    return { error: storageErrorMessage(error) }
  }

  return {}
}

export async function getApplicationPhotoSignedUrlClient(
  storagePath: string
): Promise<string | null> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !storagePath.startsWith(`${user.id}/`)) {
    return null
  }

  const { data, error } = await supabase.storage
    .from(APPLICATION_PHOTOS_BUCKET)
    .createSignedUrl(storagePath, 3600)

  if (error || !data?.signedUrl) {
    return null
  }

  return data.signedUrl
}
