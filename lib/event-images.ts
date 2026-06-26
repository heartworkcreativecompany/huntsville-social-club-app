const EVENT_STOCK_IMAGES = [
  '/brand/hsc-event-rooftop.jpg',
  '/brand/hsc-event-wine.jpg',
  '/brand/hsc-event-hike.jpeg',
  '/brand/hsc-scene-rooftop.jpg',
  '/brand/hsc-scene-dinner.jpg',
  '/brand/hsc-huntsville.jpg',
] as const

/** Deterministic stock image for events without a custom cover. */
export function eventCoverImage(eventId: string): string {
  let hash = 0
  for (let i = 0; i < eventId.length; i += 1) {
    hash = (hash + eventId.charCodeAt(i) * (i + 1)) % EVENT_STOCK_IMAGES.length
  }
  return EVENT_STOCK_IMAGES[hash] ?? EVENT_STOCK_IMAGES[0]
}
