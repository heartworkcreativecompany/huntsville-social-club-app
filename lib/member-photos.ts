import type { ApplicationPhoto } from '@/lib/application'
import { parseApplicationDraft } from '@/lib/application'

export function photosFromApplicationDraft(
  applicationDraft: unknown
): ApplicationPhoto[] {
  return parseApplicationDraft(applicationDraft).photos
}

export function primaryMemberPhoto(
  photos: ApplicationPhoto[]
): ApplicationPhoto | null {
  return photos.find((photo) => photo.isPrimary) ?? photos[0] ?? null
}
