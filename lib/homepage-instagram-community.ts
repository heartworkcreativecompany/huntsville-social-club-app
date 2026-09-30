/** Profile follow button only. Not a substitute for an individual post permalink. */
export const HSC_INSTAGRAM_PROFILE_URL =
  'https://www.instagram.com/huntsvillesocialclub/' as const

export const HOMEPAGE_INSTAGRAM_EYEBROW = 'FOLLOW ALONG'
export const HOMEPAGE_INSTAGRAM_HEADING = 'The Social Side of HSC'
export const HOMEPAGE_INSTAGRAM_BODY =
  'Events, local favorites, new connections, and the moments that make Huntsville feel a little more connected.'
export const HOMEPAGE_INSTAGRAM_HANDLE = '@huntsvillesocialclub'
export const HOMEPAGE_INSTAGRAM_CTA = 'Follow on Instagram'
export const HOMEPAGE_INSTAGRAM_OVERLAY_LABEL = 'View on Instagram'
export const HOMEPAGE_INSTAGRAM_UNCONFIGURED_LABEL = 'Thumbnail and post link needed'

export type HomepageInstagramTile = {
  /** Local thumbnail path, for example `/brand/instagram/post-1.jpg`. */
  image: string
  /** Description of that exact thumbnail. */
  alt: string
  /** Exact post permalink: `https://www.instagram.com/p/<id>/` or `/reel/<id>/`. */
  href: string
}

/**
 * Five slots for owner-supplied Instagram posts.
 * Each slot stays blank until the local thumbnail, alt text, and that post's permalink are all known.
 */
export const HOMEPAGE_INSTAGRAM_POST_SLOTS: readonly HomepageInstagramTile[] = [
  { image: '', alt: '', href: '' },
  { image: '', alt: '', href: '' },
  { image: '', alt: '', href: '' },
  { image: '', alt: '', href: '' },
  { image: '', alt: '', href: '' },
]

const INSTAGRAM_POST_PERMALINK =
  /^https:\/\/www\.instagram\.com\/(?:p|reel)\/[A-Za-z0-9_-]+\/?$/

export function isConfiguredInstagramPost(tile: HomepageInstagramTile): boolean {
  const image = tile.image.trim()
  const alt = tile.alt.trim()
  const href = tile.href.trim()

  if (!image.startsWith('/') || image.includes('..') || /^https?:/i.test(image)) {
    return false
  }
  if (!alt || alt.toLowerCase() === HOMEPAGE_INSTAGRAM_HANDLE.toLowerCase()) {
    return false
  }
  if (href === HSC_INSTAGRAM_PROFILE_URL || href === 'https://www.instagram.com/huntsvillesocialclub') {
    return false
  }
  return INSTAGRAM_POST_PERMALINK.test(href)
}

export function homepageInstagramLinkLabel(alt: string): string {
  return `View this Huntsville Social Club Instagram post: ${alt.trim()}`
}
