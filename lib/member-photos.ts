import type { ApplicationPhoto } from '@/lib/application'
import { parseApplicationDraft } from '@/lib/application'

/**
 * Visible photo frame on member directory cards.
 * Width 4, height 5 — portrait, not a square.
 */
export const MEMBER_DIRECTORY_CARD_PHOTO_ASPECT_CLASS = 'aspect-[4/5]'

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
