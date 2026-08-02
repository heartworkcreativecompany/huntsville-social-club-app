import { createClient } from '@/lib/supabase/client'

export const BUSINESS_LISTING_IMAGES_BUCKET = 'business-listing-images'

const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
] as const

function extensionForMime(type: string): string {
  if (type === 'image/png') return 'png'
  if (type === 'image/webp') return 'webp'
  return 'jpg'
}

export function validateBusinessListingImageFile(file: File): string | null {
  if (file.size === 0) {
    return 'Please choose a valid image file.'
  }

  if (
    !ALLOWED_MIME_TYPES.includes(
      file.type as (typeof ALLOWED_MIME_TYPES)[number]
    )
  ) {
    return 'Header image must be JPEG, PNG, or WebP.'
  }

  if (file.size > MAX_BYTES) {
    return 'Header image must be 5 MB or smaller.'
  }

  return null
}

export async function uploadBusinessListingHeaderImage(
  file: File
): Promise<{ url?: string; error?: string }> {
  const validationError = validateBusinessListingImageFile(file)
  if (validationError) {
    return { error: validationError }
  }

  const supabase = createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { error: 'You must be signed in to upload an image.' }
  }

  const imageId = crypto.randomUUID()
  const storagePath = `${user.id}/${imageId}.${extensionForMime(file.type)}`
  const contentType =
    file.type &&
    ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number])
      ? file.type
      : 'image/jpeg'

  const { error } = await supabase.storage
    .from(BUSINESS_LISTING_IMAGES_BUCKET)
    .upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType,
    })

  if (error) {
    return { error: error.message || 'Upload failed. Please try again.' }
  }

  const { data } = supabase.storage
    .from(BUSINESS_LISTING_IMAGES_BUCKET)
    .getPublicUrl(storagePath)

  if (!data.publicUrl) {
    return { error: 'Upload succeeded but the image URL could not be resolved.' }
  }

  return { url: data.publicUrl }
}
