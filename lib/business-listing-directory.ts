import {
  compareBusinessListingIndustries,
  formatBusinessListingIndustryLabel,
} from '@/lib/business-listing-industries'

export const BUSINESS_DIRECTORY_PATH = '/business'

export const BUSINESS_DIRECTORY_GRID_CLASS =
  'grid gap-5 sm:grid-cols-2 lg:grid-cols-3'

/** Public directory/detail fields only — never select phone, owner, or admin notes. */
export const PUBLIC_BUSINESS_LISTING_SELECT =
  'id, business_name, description, industry, website_url, city, club_offer, header_image_url, status'

const LISTING_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type PublicBusinessListing = {
  id: string
  business_name: string
  description: string
  industry: string
  website_url: string | null
  city: string | null
  club_offer: string
  header_image_url: string | null
  status: string
}

export type PublicBusinessListingSection<
  T extends PublicBusinessListing = PublicBusinessListing,
> = {
  industry: string
  listings: T[]
}

export type BusinessListingImageFit = 'cover' | 'contain'

export function isApprovedBusinessListing(
  listing: Pick<PublicBusinessListing, 'status'>
): boolean {
  return listing.status === 'approved'
}

/**
 * Public detail slug is the listing row UUID — the stable canonical identifier.
 * Business names are not unique and there is no slug column.
 */
export function parseBusinessListingDetailSlug(
  value: string | null | undefined
): string | null {
  const trimmed = value?.trim() ?? ''
  if (!trimmed || !LISTING_ID_PATTERN.test(trimmed)) return null
  return trimmed
}

export function businessListingDetailHref(
  listing: Pick<PublicBusinessListing, 'id'>
): string {
  return `${BUSINESS_DIRECTORY_PATH}/${listing.id}`
}

export function resolveApprovedPublicBusinessListing(
  slug: string | null | undefined,
  listing: PublicBusinessListing | null | undefined
): PublicBusinessListing | null {
  const listingId = parseBusinessListingDetailSlug(slug)
  if (!listingId || !listing || listing.id !== listingId) return null
  if (!isApprovedBusinessListing(listing)) return null
  return listing
}

export function groupPublicBusinessListingsByIndustry<
  T extends PublicBusinessListing,
>(listings: readonly T[]): PublicBusinessListingSection<T>[] {
  const byIndustry = new Map<string, T[]>()

  for (const listing of listings) {
    if (!isApprovedBusinessListing(listing)) continue
    const key = formatBusinessListingIndustryLabel(listing.industry)
    const group = byIndustry.get(key) ?? []
    group.push(listing)
    byIndustry.set(key, group)
  }

  return [...byIndustry.entries()]
    .sort(([a], [b]) => {
      const sampleA = byIndustry.get(a)?.[0]?.industry
      const sampleB = byIndustry.get(b)?.[0]?.industry
      return compareBusinessListingIndustries(sampleA, sampleB)
    })
    .map(([industry, group]) => ({ industry, listings: group }))
}

/**
 * JPEG listing photos crop to fill the card-top frame.
 * PNG/WebP/SVG/GIF logos letterbox with padding so marks are not cropped.
 */
export function businessListingImageFit(
  url: string | null | undefined
): BusinessListingImageFit {
  if (!url) return 'cover'
  const path = url.split('?')[0]?.toLowerCase() ?? ''
  if (
    path.endsWith('.png') ||
    path.endsWith('.webp') ||
    path.endsWith('.svg') ||
    path.endsWith('.gif')
  ) {
    return 'contain'
  }
  return 'cover'
}
