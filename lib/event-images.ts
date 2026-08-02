const EVENT_STOCK_IMAGES = [
  '/brand/hsc-event-rooftop.jpg',
  '/brand/hsc-event-wine.jpg',
  '/brand/hsc-event-hike.jpeg',
  '/brand/hsc-scene-rooftop.jpg',
  '/brand/hsc-scene-dinner.jpg',
  '/brand/hsc-huntsville.jpg',
] as const

/** Prefer a custom cover URL when set; otherwise use a deterministic stock image. */
export function eventCoverImage(
  eventId: string,
  coverImageUrl?: string | null
): string {
  const custom = coverImageUrl?.trim()
  if (custom) return custom

  let hash = 0
  for (let i = 0; i < eventId.length; i += 1) {
    hash = (hash + eventId.charCodeAt(i) * (i + 1)) % EVENT_STOCK_IMAGES.length
  }
  return EVENT_STOCK_IMAGES[hash] ?? EVENT_STOCK_IMAGES[0]
}

export function isRemoteEventCoverImage(src: string): boolean {
  return /^https?:\/\//i.test(src)
}
