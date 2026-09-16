import Card from '@/components/ui/card'
import {
  businessListingImageFit,
  type PublicBusinessListing,
} from '@/lib/business-listing-directory'
import { normalizeBusinessWebsiteUrl } from '@/lib/business-listing-website'

export default function BusinessDirectoryCard({
  listing,
}: {
  listing: PublicBusinessListing
}) {
  const websiteHref = normalizeBusinessWebsiteUrl(listing.website_url)
  const imageFit = businessListingImageFit(listing.header_image_url)
  const clubOffer = listing.club_offer.trim()
  const description = listing.description.trim()

  return (
    <Card
      padding="none"
      className="flex h-full min-w-0 flex-col overflow-hidden transition hover:border-accent/25 hover:shadow-md"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-elevated">
        {listing.header_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={listing.header_image_url}
            alt=""
            className={
              imageFit === 'contain'
                ? 'h-full w-full object-contain p-4'
                : 'h-full w-full object-cover'
            }
          />
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-5 sm:p-6">
        <h3 className="text-display text-lg font-semibold break-words">
          {listing.business_name}
        </h3>
        {listing.city ? (
          <p className="mt-1 text-sm text-muted-foreground break-words">
            {listing.city}
          </p>
        ) : null}
        {description ? (
          <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted-foreground break-words">
            {description}
          </p>
        ) : null}
        {clubOffer ? (
          <div className="mt-3 min-w-0">
            <p className="eyebrow">Club Offer</p>
            <p className="mt-1 text-sm leading-relaxed text-foreground break-words">
              {clubOffer}
            </p>
          </div>
        ) : null}
        {websiteHref ? (
          <a
            href={websiteHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Visit ${listing.business_name} website`}
            className="mt-4 font-brand text-sm font-medium text-accent break-words focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Visit website ↗
          </a>
        ) : null}
      </div>
    </Card>
  )
}
