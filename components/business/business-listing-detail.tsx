import Link from 'next/link'
import BusinessWebsiteLink from '@/components/business/business-website-link'
import { formatBusinessListingIndustryLabel } from '@/lib/business-listing-industries'
import {
  BUSINESS_DIRECTORY_PATH,
  businessListingImageFit,
  type PublicBusinessListing,
} from '@/lib/business-listing-directory'

export default function BusinessListingDetail({
  listing,
}: {
  listing: PublicBusinessListing
}) {
  const imageFit = businessListingImageFit(listing.header_image_url)
  const description = listing.description.trim()
  const clubOffer = listing.club_offer.trim()
  const industry = formatBusinessListingIndustryLabel(listing.industry)

  return (
    <>
      <Link
        href={BUSINESS_DIRECTORY_PATH}
        className="mb-6 inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to Business Directory
      </Link>

      <article className="mx-auto w-full max-w-3xl">
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-surface-elevated sm:aspect-[16/9]">
          {listing.header_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={listing.header_image_url}
              alt=""
              className={
                imageFit === 'contain'
                  ? 'h-full w-full object-contain p-6 sm:p-8'
                  : 'h-full w-full object-cover'
              }
            />
          ) : null}
        </div>

        <header className="mt-6 min-w-0">
          {industry ? <p className="eyebrow">{industry}</p> : null}
          <h1 className="text-display mt-1 text-2xl font-semibold break-words sm:text-4xl">
            {listing.business_name}
          </h1>
          {listing.city ? (
            <p className="mt-2 text-sm text-muted-foreground break-words">
              {listing.city}
            </p>
          ) : null}
        </header>

        {description ? (
          <p className="mt-6 max-w-2xl text-base leading-relaxed break-words whitespace-pre-wrap text-foreground">
            {description}
          </p>
        ) : null}

        {clubOffer ? (
          <div className="mt-8 max-w-2xl min-w-0">
            <p className="eyebrow">Club Offer</p>
            <p className="mt-2 text-base leading-relaxed break-words whitespace-pre-wrap text-foreground">
              {clubOffer}
            </p>
          </div>
        ) : null}

        <BusinessWebsiteLink
          businessName={listing.business_name}
          websiteUrl={listing.website_url}
          className="mt-8 inline-block font-brand text-sm font-medium text-accent break-words focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        />
      </article>
    </>
  )
}
