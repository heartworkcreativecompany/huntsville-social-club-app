/** Curated homepage gallery. These are editorial photos, not a live Instagram feed. */
export const HSC_INSTAGRAM_PROFILE_URL =
  'https://www.instagram.com/huntsvillesocialclub/' as const

export const HOMEPAGE_INSTAGRAM_EYEBROW = 'FOLLOW ALONG'
export const HOMEPAGE_INSTAGRAM_HEADING = 'The Social Side of HSC'
export const HOMEPAGE_INSTAGRAM_BODY =
  'Events, local favorites, new connections, and the moments that make Huntsville feel a little more connected.'
export const HOMEPAGE_INSTAGRAM_HANDLE = '@huntsvillesocialclub'
export const HOMEPAGE_INSTAGRAM_CTA = 'Follow on Instagram'
export const HOMEPAGE_INSTAGRAM_OVERLAY_LABEL = 'View on Instagram'

export type HomepageInstagramTile = {
  image: string
  alt: string
  href: string
}

export const HOMEPAGE_INSTAGRAM_TILES: readonly HomepageInstagramTile[] = [
  {
    image: '/brand/hsc-event-wine.jpg',
    alt: 'Guests talking along a candlelit dinner table set with wine glasses',
    href: HSC_INSTAGRAM_PROFILE_URL,
  },
  {
    image: '/brand/hsc-event-rooftop.jpg',
    alt: 'People holding drinks at a rooftop gathering under string lights at sunset',
    href: HSC_INSTAGRAM_PROFILE_URL,
  },
  {
    image: '/brand/hsc-hero-lounge.jpg',
    alt: 'A dim lounge with a green velvet banquette, marble tables, and candles',
    href: HSC_INSTAGRAM_PROFILE_URL,
  },
  {
    image: '/brand/hsc-scene-cafe.jpg',
    alt: 'Two coffee cups on a sunlit cafe table beside a window',
    href: HSC_INSTAGRAM_PROFILE_URL,
  },
  {
    image: '/brand/hsc-scene-workshop.jpg',
    alt: 'Hands shaping a clay cup on a pottery wheel beside ceramic bowls',
    href: HSC_INSTAGRAM_PROFILE_URL,
  },
]

export function homepageInstagramLinkLabel(alt: string): string {
  const description = alt.trim()
  if (!description) {
    return 'View Huntsville Social Club on Instagram'
  }
  return `View Huntsville Social Club on Instagram: ${description}`
}
