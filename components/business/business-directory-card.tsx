import Link from 'next/link'
import Card from '@/components/ui/card'
import BusinessWebsiteLink from '@/components/business/business-website-link'
import {
  businessListingDetailHref,
  businessListingImageFit,
  type PublicBusinessListing,
} from '@/lib/business-listing-directory'

const detailLinkClassName =
  'font-brand text-sm font-medium text-accent break-words focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background'

export default function BusinessDirectoryCard({
  listing,
}: {
  listing: PublicBusinessListing
}) {
  const detailHref = businessListingDetailHref(listing)
  const imageFit = businessListingImageFit(listing.header_image_url)
  const clubOffer = listing.club_offer.trim()
  const description = listing.description.trim()
  const detailsLabel = `View ${listing.business_name} details`

  return (
    <Card
      padding="none"
      className="flex h-full min-w-0 flex-col overflow-hidden transition hover:border-accent/25 hover:shadow-md"
    >
      <Link
        href={detailHref}
        aria-label={detailsLabel}
        className="relative aspect-[4/3] w-full overflow-hidden bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-inset"
      >
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
      </Link>

      <div className="flex min-w-0 flex-1 flex-col p-5 sm:p-6">
        <h3 className="text-display text-lg font-semibold break-words">
          <Link
            href={detailHref}
            className="text-inherit no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {listing.business_name}
          </Link>
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
        <div className="mt-auto flex flex-col items-start gap-2 pt-4">
          <Link href={detailHref} className={detailLinkClassName}>
            View details →
          </Link>
          <BusinessWebsiteLink
            businessName={listing.business_name}
            websiteUrl={listing.website_url}
          />
        </div>
      </div>
    </Card>
  )
}
